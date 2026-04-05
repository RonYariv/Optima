# Optima Sandbox — Design & Implementation Plan

A local data-generation harness that seeds **realistic audit log data** so every
page of the Optima UI has something useful to show without connecting a real
customer agent.

---

## Goal

Run the full docker-compose stack, then execute sandbox scripts that simulate
multiple agent frameworks calling into Optima. After running, the UI should
show:

- Several **traces** with different statuses (running / success / failed)
- **Audit log timelines** with all seven event kinds
- **Failure events** on the Failures page
- **Cost data** on the Cost page

---

## What the sandbox simulates

### Mock MCP servers

Two lightweight HTTP+JSON-RPC servers that respond to MCP `tools/call` requests.
They add realistic latency with `setTimeout` and occasionally return errors.

| Mock MCP | Tools exposed | Simulated behaviour |
|---|---|---|
| `mcp-filesystem` | `read_file`, `write_file`, `list_dir` | 20–80 ms, random permission error on `write_file` |
| `mcp-web-search` | `search`, `fetch_page` | 200–600 ms, rate-limit error 1-in-5 on `search` |

Both run as Express servers on localhost ports during the sandbox run. The
sandbox calls them locally and then posts the resulting `mcp_call` audit events
to Optima itself.

### Mock built-in tools

Pure in-process functions — no network. Called by the agent scenarios and
reported as `tool_call` audit events.

| Tool | What it does |
|---|---|
| `calculator` | Evaluates simple numeric expressions |
| `code_executor` | Fake code execution; always succeeds with `{"stdout": "..."}` |
| `summariser` | Returns a fixed lorem-ipsum summary with token count metadata |
| `email_sender` | Always fails with `RateLimitError` (useful for failure coverage) |

### Agent scenarios

Four complete scenarios, each runs as its own trace:

| Scenario | Framework style | Agents | Event kinds produced |
|---|---|---|---|
| Research Bot | Manual SDK (Node.js) | `research-orchestrator` | agent_start, model_call, mcp_call (web_search), tool_call (calculator), agent_end |
| Coding Assistant | Manual SDK (Node.js) | `code-assistant` | agent_start, model_call, tool_call (code_executor), tool_call (email — **fails**), agent_end |
| Multi-agent Handoff | agentic-framework style (Python) | `orchestrator` → `researcher` → `writer` | agent_start, agent_handoff ×2, model_call ×3, mcp_call (filesystem), agent_end |
| LangChain Pipeline | LangChain callback style (Python) | `langchain-agent` | agent_start, model_call, tool_call, mcp_call (web_search), agent_end |

---

## Directory layout

```
sandbox/
├── package.json            Node.js sandbox package (@agent-optima/sandbox)
├── tsconfig.json
├── .env.example            OPTIMA_URL, OPTIMA_TOKEN, TENANT_ID, PROJECT_ID
│
├── src/
│   ├── index.ts            CLI entry — run all or a named scenario
│   ├── lib/
│   │   ├── client.ts       Wraps OptimaClient; auto-increments sequenceNo per trace
│   │   └── ids.ts          Deterministic fake IDs using crypto.randomUUID()
│   │
│   ├── mock-mcp/
│   │   ├── filesystem.ts   Express server on :4010, MCP JSON-RPC over HTTP
│   │   ├── web-search.ts   Express server on :4011
│   │   └── index.ts        startMockMcpServers() / stopMockMcpServers()
│   │
│   ├── mock-tools/
│   │   └── index.ts        calculator, code_executor, summariser, email_sender
│   │
│   └── scenarios/
│       ├── research-bot.ts
│       ├── coding-assistant.ts
│       └── multi-agent-handoff.ts   (Node.js version)
│
└── python/
  ├── requirements.txt    framework/runtime deps only (no SDK)
  ├── run.py              deprecated helper (use uvicorn agentic_server:app)
    ├── mock_tools.py       Pure-function mock tools
    ├── scenarios/
    │   ├── agentic_style.py     Multi-agent handoff (agentic-framework patterns)
    │   └── langchain_style.py   LangChain callback handler style
    └── lib/
        └── tracer.py       Thin wrapper: auto sequence_no, ISO timestamps
```

---

## Implementation steps

### Step 1 — package setup

**`sandbox/package.json`**
```json
{
  "name": "@agent-optima/sandbox",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "all": "tsx src/index.ts --all"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "tsx": "^4.7.0"
  }
}
```

Add `sandbox` to the root `package.json` workspaces array.

**`sandbox/tsconfig.json`**
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

**`sandbox/.env.example`**
```
OPTIMA_URL=http://localhost:3000
OPTIMA_TOKEN=<paste token from optima-ctl token generate>
TENANT_ID=sandbox
PROJECT_ID=demo
```

---

### Step 2 — `src/lib/client.ts`

Wraps direct HTTP ingest calls and adds:

- `sequenceNo` counter per `traceId` (auto-increment)
- `occurredAt` stamping (ISO string from `Date.now()`)
- `auditEvent(traceId, kind, fields)` helper that POSTs to
  `POST /v1/ingest/audit-event`

```ts
// direct HTTP transport (fetch/httpx) — no SDK dependency

// Sequence counter map — keyed by traceId
const seqMap = new Map<string, number>();

function nextSeq(traceId: string): number {
  const n = (seqMap.get(traceId) ?? -1) + 1;
  seqMap.set(traceId, n);
  return n;
}

export function createSandboxTracer(client: OptimaClient, tenantId: string, projectId: string, traceId: string, agentId: string) {
  return {
    async event(kind: AuditEventKind, fields: Partial<AuditEventIngest> = {}) {
      await client.ingest.auditEvent({
        tenantId,
        projectId,
        traceId,
        agentId,
        sequenceNo: nextSeq(traceId),
        kind,
        occurredAt: new Date().toISOString(),
        metadata: {},
        ...fields,
      });
    },
  };
}
```

**Note:** Sandbox telemetry now uses direct HTTP bridge calls (`/v1/ingest/*`).
No SDK extension is required for sandbox scenarios.

---

### Step 3 — Mock MCP servers

**`src/mock-mcp/filesystem.ts`**

```ts
import express from 'express';

const app = express();
app.use(express.json());

app.post('/mcp', (req, res) => {
  const { method, params, id } = req.body;

  if (method === 'tools/call') {
    const tool = params.name as string;
    const delay = 20 + Math.random() * 60;   // 20–80 ms

    setTimeout(() => {
      if (tool === 'write_file' && Math.random() < 0.2) {
        return res.json({
          jsonrpc: '2.0', id,
          error: { code: -32001, message: 'PermissionDenied: /data is read-only' },
        });
      }
      res.json({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `mock result for ${tool}` }],
        },
      });
    }, delay);
  } else {
    res.status(404).end();
  }
});

export function startFilesystemMcp(port = 4010) {
  return new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
}
```

`web-search.ts` follows the same pattern with port 4011, 200–600 ms delay, and
1-in-5 rate-limit error on the `search` tool.

**`src/mock-mcp/index.ts`**
```ts
import { startFilesystemMcp } from './filesystem.js';
import { startWebSearchMcp } from './web-search.js';

export async function startMockMcpServers() {
  const fs   = await startFilesystemMcp(4010);
  const ws   = await startWebSearchMcp(4011);
  return { stop: () => { fs.close(); ws.close(); } };
}
```

---

### Step 4 — Mock built-in tools

**`src/mock-tools/index.ts`**

```ts
export interface ToolResult {
  output: Record<string, unknown>;
  latencyMs: number;
  success: boolean;
  errorType?: string;
}

export async function runTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  const start = Date.now();

  switch (name) {
    case 'calculator': {
      await sleep(5 + Math.random() * 15);
      return { output: { result: 42 }, latencyMs: Date.now() - start, success: true };
    }
    case 'code_executor': {
      await sleep(100 + Math.random() * 200);
      return { output: { stdout: '// output', exitCode: 0 }, latencyMs: Date.now() - start, success: true };
    }
    case 'summariser': {
      await sleep(30 + Math.random() * 50);
      return { output: { summary: 'Lorem ipsum summary…', tokens: 128 }, latencyMs: Date.now() - start, success: true };
    }
    case 'email_sender': {
      await sleep(50);
      return { output: {}, latencyMs: Date.now() - start, success: false, errorType: 'RateLimitError' };
    }
    default:
      return { output: {}, latencyMs: Date.now() - start, success: false, errorType: 'UnknownTool' };
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
```

---

### Step 5 — Scenario: Research Bot (Node.js)

**`src/scenarios/research-bot.ts`**

```ts
export async function runResearchBot(client, tenantId, projectId) {
  const traceId = randomUUID();
  const t = createSandboxTracer(client, tenantId, projectId, traceId, 'research-orchestrator');

  // 1. Agent starts
  await t.event('agent_start', { name: 'Research Orchestrator', input: { query: 'Best LLM papers 2025' } });

  // 2. Model decides to search
  await sleep(200 + Math.random() * 400);   // simulate model latency
  await t.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Research LLM papers 2025' }] },
    output: { content: 'I will search the web first.' },
    latencyMs: 320,
    metadata: { inputTokens: 120, outputTokens: 45, model: 'gpt-4o' },
  });

  // 3. MCP web_search
  const searchResult = await callMcp('http://localhost:4011/mcp', 'search', { q: 'LLM papers 2025' });
  await t.event('mcp_call', {
    actorId: 'mcp-web-search',
    name: 'search',
    input: { q: 'LLM papers 2025' },
    output: searchResult.ok ? searchResult.result : null,
    latencyMs: searchResult.latencyMs,
    success: searchResult.ok,
    error: searchResult.ok ? undefined : { type: 'RateLimitError', message: searchResult.error },
  });

  // 4. Built-in: calculator (cost estimate)
  const calc = await runTool('calculator', { expr: '3 * 7' });
  await t.event('tool_call', { name: 'calculator', input: { expr: '3 * 7' }, output: calc.output, latencyMs: calc.latencyMs, success: true });

  // 5. Final model call to synthesise
  await sleep(300 + Math.random() * 300);
  await t.event('model_call', {
    name: 'gpt-4o',
    input: { messages: [{ role: 'user', content: 'Synthesise findings' }] },
    output: { content: 'Here is the research summary…' },
    latencyMs: 410,
    metadata: { inputTokens: 800, outputTokens: 320, model: 'gpt-4o' },
  });

  // 6. Agent ends
  await t.event('agent_end', { name: 'Research Orchestrator', output: { summary: 'Done' }, success: true });

  console.log(`research-bot trace: ${traceId}`);
}
```

---

### Step 6 — Scenario: Coding Assistant with failure (Node.js)

**`src/scenarios/coding-assistant.ts`**

Steps:
1. `agent_start`
2. `model_call` — decides to write and run code
3. `tool_call: code_executor` — success
4. `model_call` — decides to email the result
5. `tool_call: email_sender` — **fails** with `RateLimitError`
6. `agent_end` with `success: false`

This produces a failure event automatically through the existing
`ToolCallWorker` (which creates a `failure_events` row on `success: false`).

---

### Step 7 — Scenario: Multi-agent Handoff (Node.js)

**`src/scenarios/multi-agent-handoff.ts`**

Three agents in one trace:

```
orchestrator
  └─ agent_handoff → researcher
       └─ mcp_call: filesystem.read_file
       └─ model_call: gpt-4o
       └─ agent_end (researcher)
  └─ agent_handoff → writer
       └─ model_call: gpt-4o
       └─ tool_call: summariser
       └─ agent_end (writer)
orchestrator → agent_end
```

`actorId` on handoff events is the source agent; `name` is the target agent.

---

### Step 8 — CLI entry point

**`src/index.ts`**

```ts
import { startMockMcpServers } from './mock-mcp/index.js';
import { runResearchBot } from './scenarios/research-bot.js';
import { runCodingAssistant } from './scenarios/coding-assistant.js';
import { runMultiAgentHandoff } from './scenarios/multi-agent-handoff.js';

const OPTIMA_URL   = process.env.OPTIMA_URL   ?? 'http://localhost:3000';
const OPTIMA_TOKEN = process.env.OPTIMA_TOKEN ?? '';
const TENANT_ID    = process.env.TENANT_ID    ?? 'sandbox';
const PROJECT_ID   = process.env.PROJECT_ID   ?? 'demo';

const client = { baseUrl: OPTIMA_URL, token: OPTIMA_TOKEN };

const scenario = process.argv[2] ?? 'all';

const { stop } = await startMockMcpServers();

try {
  if (scenario === 'all' || scenario === 'research-bot')     await runResearchBot(client, TENANT_ID, PROJECT_ID);
  if (scenario === 'all' || scenario === 'coding-assistant') await runCodingAssistant(client, TENANT_ID, PROJECT_ID);
  if (scenario === 'all' || scenario === 'multi-agent')      await runMultiAgentHandoff(client, TENANT_ID, PROJECT_ID);
} finally {
  stop();
}
```

Run with:
```bash
cp sandbox/.env.example sandbox/.env
# fill in OPTIMA_TOKEN
npm run --workspace=@agent-optima/sandbox dev
# or single scenario:
npm run --workspace=@agent-optima/sandbox dev -- research-bot
```

---

### Step 9 — Python scenarios

**`sandbox/python/lib/tracer.py`**

```python
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

class SandboxTracer:
    def __init__(self, client, tenant_id, project_id, trace_id, agent_id):
        self._client = client
        self._tenant_id = tenant_id
        self._project_id = project_id
        self._trace_id = trace_id
        self._agent_id = agent_id
        self._seq = 0

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def event(self, kind: str, **kwargs) -> None:
        seq = self._seq
        self._seq += 1
        self._client.ingest.audit_event(
            tenant_id=self._tenant_id,
            project_id=self._project_id,
            trace_id=self._trace_id,
            agent_id=self._agent_id,
            sequence_no=seq,
            kind=kind,
            occurred_at=self._now(),
            **kwargs,
        )
```

**`sandbox/python/scenarios/agentic_style.py`** — simulates the
`agentic-framework` event stream (prompt_started → subagent_call →
tool_call/tool_result → completion_end → turn_end) mapped to audit events the
same way the real `OptimaAgenticListener` adapter would.

**`sandbox/python/scenarios/langchain_style.py`** — simulates the LangChain
`BaseCallbackHandler` pattern (on_llm_start, on_tool_start, on_agent_finish)
mapped to audit events the same way the real `OptimaCallbackHandler` adapter
would.

Run with:
```bash
cd sandbox/python
python run.py
```

---

### Step 10 — Direct HTTP bridge

Use `/v1/ingest/*` endpoints directly from framework adapters. No SDK package changes are required.

---

## Prerequisites before running

1. `docker compose up -d` — postgres + all four services running
2. `npm run --workspace=@agent-optima/cli dev -- token generate --tenant sandbox`
   → copy the JWT into `sandbox/.env` as `OPTIMA_TOKEN`
3. Ensure migration 0004 ran (analytics-workers does this on startup)

---

## Expected UI result after running

| Page | What you see |
|---|---|
| Traces | 3–4 traces: `research-bot` (success), `coding-assistant` (failed), `multi-agent-handoff` (success) |
| Trace detail → Graph tab | React Flow graph with agent/model/tool nodes |
| Trace detail → Audit Log tab | Timeline of 6–12 events with input/output JSON |
| Failures | 1 failure entry from `email_sender` RateLimitError |
| Cost | Aggregated cost rows for `gpt-4o` model calls |

---

## Future additions (not in scope for this session)

- **Python `agentic-framework` multi-agent** with 3 real subagent hand-offs
- **OpenAI Agents SDK style** (TracingProcessor pattern)
- **OTEL scenario** — emit OTEL spans directly to `POST /v1/otel/traces` once the OTEL receiver is built
- **Volume seeder** — loop over all scenarios N times with randomised latency to fill charts
- **`sandbox seed --days 7`** CLI flag to back-date `occurredAt` so cost charts have a week of history
