# Audit Log — Integration Strategy

How Optima captures the full narrative of an agent run (agent starts/ends, model calls, tool calls, MCP calls, handoffs) across every major agentic framework.

---

## The Three Layers

Optima uses three complementary layers so that every framework is covered at the right cost-of-integration:

| Layer | How it works | Customer effort |
|---|---|---|
| **B — OTEL receiver** | Optima exposes an OTLP/HTTP endpoint. Frameworks that already emit OpenTelemetry spans just point their exporter at Optima. | Change one env var |
| **A — Framework adapters** | For frameworks that do NOT emit OTEL, Optima ships a thin adapter that hooks into the framework's own callback/event system. | `pip install` / `npm install` + one constructor arg |
| **Manual SDK** | Call `OptimaTracer` directly for custom/homegrown frameworks. | Instrument each event by hand |

---

## Layer B — OTEL Receiver (zero config for the customer)

Frameworks that are already instrumented with OpenTelemetry just need their **OTLP exporter endpoint** pointed at Optima.

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://optima-gateway:3000
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Optima's OTEL receiver translates incoming `gen_ai.*` semantic convention spans → `audit_events` rows.

### Span → Audit Event mapping

| OTEL span name / attribute | `audit_event.kind` | Notes |
|---|---|---|
| `create_agent` | `agent_start` | `gen_ai.agent.name` → `name` |
| `invoke_agent` | `agent_end` | `gen_ai.agent.id` → `actor_id` |
| `chat.completions *` | `model_call` | `gen_ai.request.model`, token counts |
| `execute_tool` | `tool_call` or `mcp_call` | detected by `gen_ai.tool.type = "mcp"` |
| span error / `status_code = ERROR` | sets `success = false`, populates `error` field | |

### Frameworks covered by Layer B (no adapter required)

#### `agentic-framework` (supercog-ai/agentic) — does NOT qualify for Layer B

> `pip install agentic-framework` — Python framework by supercog-ai
>
> Despite the name, this framework has its **own custom event system** and does **not** emit OpenTelemetry spans. It exposes event streams (SSE) of typed Python objects: `ToolCall`, `ToolResult`, `ToolError`, `FinishCompletion`, `SubAgentCall`, etc. It needs a **Layer A adapter** — see below.

---

#### Microsoft AutoGen (`autogen-core` / `autogen-agentchat`)

AutoGen has **native OTEL** built in. It instruments:
- `SingleThreadedAgentRuntime` and `GrpcWorkerAgentRuntime` — emits spans for every message dispatch
- `BaseChatAgent` — emits `create_agent` and `invoke_agent` spans
- `BaseTool` — emits `execute_tool` spans with GenAI semantic conventions

Customer code:
```python
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

tracer_provider = TracerProvider()
tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))

# One arg — everything is captured automatically
runtime = SingleThreadedAgentRuntime(tracer_provider=tracer_provider)
```

**No Optima adapter needed. Point the exporter at Optima and it works.**

#### Microsoft Semantic Kernel

Semantic Kernel also has **native OTEL**. It emits `gen_ai.*` spans for every AI connector call (model invocations, function calls, plugin steps).

One env var enables the full span payloads:
```
SEMANTICKERNEL_EXPERIMENTAL_GENAI_ENABLE_OTEL_DIAGNOSTICS_SENSITIVE=true
```

Customer then configures a tracer provider with the Optima OTLP endpoint. Spans include `gen_ai.request.model`, token usage, prompt/completion content (when the sensitive flag is set), function invocation durations.

**No Optima adapter needed.**

#### Other OTEL-native frameworks (Layer B)

| Framework | Status |
|---|---|
| LlamaIndex | `opentelemetry-instrumentation-llamaindex` — mature, covers query engine + retrieval + LLM calls |
| Haystack | Built-in OTEL tracer since v2.3 |
| Pydantic AI | OpenTelemetry support via `logfire` (which emits standard OTLP spans) |

---

## Layer A — Framework Adapters (for frameworks without native OTEL)

These frameworks expose a rich callback / event hook system but do **not** emit OpenTelemetry spans. Optima ships a one-liner adapter that registers against the framework's hook system and translates events into `audit_events`.

### `agentic-framework` (supercog-ai/agentic) — Python

`agentic-framework` has a rich custom event system but **no OTEL support**. After running a request you get back an event generator that yields typed Python objects. The full event type inventory from `events.py`:

| Framework event type | Maps to `audit_event.kind` | Notes |
|---|---|---|
| `prompt_started` | `agent_start` | `payload` is the initial prompt |
| `subagent_call` | `agent_handoff` | `agent` → `target_agent` |
| `tool_call` | `tool_call` or `mcp_call` | Check tool name against known MCP tools |
| `tool_result` | (enriches prior `tool_call` event with `output` + `latencyMs`) | |
| `tool_error` | `tool_call` with `success=false`, `error` field populated | |
| `completion_end` (`FinishCompletion`) | `model_call` | Has `model`, `input_tokens`, `output_tokens`, `cost`, `elapsed_time` |
| `turn_end` | `agent_end` | Final message is in `messages[-1]` |
| `reasoning_content` | `custom` (kind=`custom`, name=`reasoning`) | Optional — can be filtered |

The framework's event stream is accessed by iterating `agent.get_events(request_id)` **or** consuming the REST API's SSE endpoint `/runs/<id>/events`.

**Optima adapter:**
```python
from optima_bridge.adapters.agentic_framework import OptimaAgenticListener

listener = OptimaAgenticListener(
    client=optima_client,
    tenant_id="acme",
    project_id="research-bot",
    trace_id="run-abc-123",
)

request_id = my_agent.start_request("Research AI papers").request_id

# One call — listener consumes the stream and emits audit events automatically
await listener.consume(my_agent.get_events(request_id))
```

Or as a decorator on the run loop:
```python
async with OptimaAgenticListener.wrap(my_agent, client=optima_client, ...) as agent:
    result = agent << "Research AI papers"
```

**How the adapter works internally:**
1. Subscribes to the event generator
2. Tracks `sequence_no` (auto-incremented per event)
3. Buffers `tool_call` events until the matching `tool_result`/`tool_error` arrives, then emits a single audit event with both `input` + `output` + computed `latencyMs`
4. Assembles `model_call` events from `FinishCompletion` (which already carries model name, token counts, cost, and elapsed time)
5. Fires `audit_event` POSTs to the Optima ingest endpoint — non-blocking / `asyncio.create_task`

---

### LangChain / LangGraph (Python + JS)

LangChain exposes `BaseCallbackHandler` with fine-grained hooks:
- `on_llm_start` / `on_llm_end` / `on_llm_error`
- `on_tool_start` / `on_tool_end` / `on_tool_error`
- `on_agent_action` / `on_agent_finish`
- `on_chain_start` / `on_chain_end`

**Optima adapter:**
```python
from optima_bridge.adapters.langchain import OptimaCallbackHandler

handler = OptimaCallbackHandler(
    client=optima_client,
    trace_id="my-run-id",
    tenant_id="acme",
    project_id="research-bot",
)

# Register once — all downstream agents/tools/chains emit automatically
agent_executor.invoke({"input": "..."}, config={"callbacks": [handler]})
```

The adapter internally calls `optima_client.ingest.audit_event(...)` for each callback it receives. LangGraph's `StateGraph` events are forwarded the same way via `CompiledGraph.stream(..., config={"callbacks": [handler]})`.

**JS equivalent:**
```ts
import { OptimaCallbackHandler } from '@agent-optima/adapter-langchain';
const handler = new OptimaCallbackHandler({ client, traceId, tenantId, projectId });
await chain.invoke({ input: '...' }, { callbacks: [handler] });
```

### CrewAI (Python)

CrewAI exposes `before_kickoff_callbacks`, `task_callback`, and `step_callback` on `Crew`.

**Optima adapter:**
```python
from optima_bridge.adapters.crewai import optima_crew_hooks

crew = Crew(
    agents=[...],
    tasks=[...],
    **optima_crew_hooks(client=optima_client, trace_id="...", tenant_id="...", project_id="..."),
)
crew.kickoff()
```

`optima_crew_hooks()` returns a dict with `step_callback` and `task_callback` pre-wired to emit audit events.

### Vercel AI SDK (JavaScript / TypeScript)

The Vercel AI SDK (`ai` npm package) provides `onStepFinish` and `onFinish` callbacks on `streamText` / `generateText` / `generateObject`.

**Optima adapter:**
```ts
import { withOptima } from '@agent-optima/adapter-vercel-ai';

const result = await streamText(
  withOptima(
    {
      model: openai('gpt-4o'),
      messages,
      tools: { /* ... */ },
      maxSteps: 10,
    },
    { client, traceId, tenantId, projectId },
  ),
);
```

`withOptima` wraps the config object, injecting `onStepFinish` (emits `model_call` + `tool_call` events per step) and `onFinish` (emits `agent_end`).

### Frameworks covered by Layer A

| Framework | Language | Hook mechanism |
|---|---|---|
| `agentic-framework` (supercog-ai) | Python | Custom event generator / SSE stream (`get_events`) |
| LangChain / LangGraph | Python, JS | `BaseCallbackHandler` / `callbacks` config key |
| CrewAI | Python | `step_callback`, `task_callback` |
| Vercel AI SDK | TypeScript | `onStepFinish`, `onFinish` |
| OpenAI Agents SDK | Python | `TracingProcessor` interface (`on_start`/`on_end`) |

> **OpenAI Agents SDK note:** It has its own `Tracing` abstraction (`TracingProcessor`). Optima ships `optima_bridge.adapters.openai_agents.OptimaTracingProcessor` which implements that interface. Not OTEL, not callback-based — it's its own adapter shape.

---

## Layer C (bonus) — MCP Proxy

For setups where the agent runtime is opaque but all interesting calls go through MCP servers, Optima can run a **transparent MCP proxy**. The customer changes one URL in their MCP client config; the proxy forwards all calls to the real server and emits `mcp_call` audit events without any SDK code at all.

This is a follow-up feature; documented here for completeness.

---

## Manual Bridge Tracer — `OptimaTracer`

The escape hatch for homegrown frameworks or any call that isn't covered by the layers above.

### Node.js

```ts
import { OptimaTracer } from '@agent-optima/bridge-node';

const tracer = new OptimaTracer(client, {
  tenantId: 'acme',
  projectId: 'research-bot',
  traceId: 'run-abc-123',
  agentId: 'orchestrator',
});

// Emits kind=agent_start
await tracer.agentStart('Research Agent', { query: 'best LLM papers 2025' });

// Emits kind=mcp_call
await tracer.mcpCall('filesystem', 'read_file', { path: '/data.txt' }, { content: '...' }, 45, true);

// Emits kind=model_call
await tracer.modelCall('gpt-4o', { messages: [...] }, { content: '...' }, 1200);

// Emits kind=tool_call with error
await tracer.toolCall('web_search', { query: '...' }, null, 300, false, {
  type: 'RateLimitError',
  message: '429 Too Many Requests',
});

// Emits kind=agent_end
await tracer.agentEnd('Research Agent', { summary: '...' }, true);
```

`OptimaTracer` auto-increments `sequenceNo` and stamps `occurredAt`. The customer is responsible for `traceId` — they should use the same one they pass to `ingest.modelCall` / `ingest.toolCall` if they use both systems in parallel.

### Python

```python
from optima_bridge import OptimaTracer

tracer = OptimaTracer(
    client=optima_client,
    tenant_id="acme",
    project_id="research-bot",
    trace_id="run-abc-123",
    agent_id="orchestrator",
)

tracer.agent_start("Research Agent", input={"query": "best LLM papers 2025"})
tracer.mcp_call("filesystem", "read_file", input={"path": "/data.txt"}, output={"content": "..."}, latency_ms=45, success=True)
tracer.agent_end("Research Agent", output={"summary": "..."}, success=True)
```

---

## Decision tree — which layer for my framework?

```
Does the framework emit OTEL spans? (AutoGen, Semantic Kernel, LlamaIndex, Haystack)
  └─ YES → Layer B: set OTEL_EXPORTER_OTLP_ENDPOINT, done.

Does Optima ship an adapter for it? (agentic-framework, LangChain, CrewAI, Vercel AI SDK, OpenAI Agents SDK)
  └─ YES → Layer A: install adapter, pass one config object.

Is it a pure MCP setup with no framework?
  └─ YES → Layer C (MCP proxy, coming soon).

Everything else (custom framework, partial coverage, homegrown)
  └─ Manual SDK: use OptimaTracer.
```

---

## What this means for the implementation roadmap

1. **Audit events DB + ingest pipeline** (table, schema, queue, worker, query API) — foundation required by all layers
2. **OTEL receiver** in `api-gateway` — unlocks Microsoft AutoGen, Semantic Kernel, LlamaIndex, Haystack instantly
3. **`agentic-framework` adapter** (`packages/adapter-agentic`) — consume event stream, map to audit events
4. **LangChain adapter** (`packages/adapter-langchain`) — highest user volume
5. **Vercel AI SDK adapter** (`packages/adapter-vercel-ai`) — highest JS/TS volume
6. **OptimaTracer** in bridge packages (`@agent-optima/bridge-node`, `optima_bridge`) — manual fallback, also used internally by adapters
7. **CrewAI adapter** + **OpenAI Agents SDK adapter** — follow-on
8. **MCP proxy** — follow-on
