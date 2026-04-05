# Agent-Optima — System Status & Roadmap

> **Date:** April 5, 2026  
> **Phase:** 1 — MVP complete (Phase 2 backlog open)

---

## What the System Is

Agent-Optima is a **self-hosted observability control plane** for AI agent systems.  
It runs entirely inside the customer's own infrastructure — no telemetry ever leaves their cluster.

Core value props:
- **Zero-egress** — all trace data stays in the customer's K8s namespace
- **Minimal footprint** — 4 containers + Postgres; no external brokers
- **Seamless integration** — one SDK import, one token, < 5 lines of instrumentation code
- **Instant insight** — trace graph, failure highlights, and cost overview out of the box

---

## Current Architecture

```
Customer's K8s Cluster
┌──────────────────────────────────────────────────────────────┐
│  Namespace: agent-optima                                      │
│                                                               │
│  ┌─────────────┐   HTTP/JSON   ┌───────────────────────────┐ │
│  │  Agent SDK  │ ────────────► │  api-gateway  :3000       │ │
│  │ (Node / Py) │               │  (ingest only)            │ │
│  └─────────────┘               └──────────┬────────────────┘ │
│                                            │ PGMQ enqueue     │
│  ┌─────────────┐               ┌──────────▼────────────────┐ │
│  │   Browser   │ ◄──────────── │  control-api  :3001       │ │
│  │  Dashboard  │   REST/JSON   │  (query / dashboard)      │ │
│  └─────────────┘               └───────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  analytics-workers  (PGMQ consumers)                    │ │
│  │  • runs DB migrations on startup                        │ │
│  │  • classifies failures  • calculates cost               │ │
│  └───────────────────────────┬─────────────────────────────┘ │
│                               │                               │
│  ┌────────────────────────────▼──────────────────────────┐   │
│  │  Postgres  (+ PGMQ extension)                         │   │
│  │  Tables: traces, trace_steps, model_calls,            │   │
│  │          tool_calls, failure_events                    │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| API runtime | Node.js 20, TypeScript (strict ESM), Fastify 5 |
| ORM / DB | Drizzle ORM + postgres-js, Postgres 16 |
| Queue | PGMQ (Postgres-native extension) |
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Flow, Recharts |
| SDK (Node.js) | Zero-dependency ESM package (`@agent-optima/sdk-node`) |
| SDK (Python) | Zero-dependency stdlib package (`optima-sdk`, sync + async) |
| Containerisation | Docker multi-stage builds, docker-compose, Helm (in progress) |
| Migrations | Drizzle Kit — SQL files committed, applied on `analytics-workers` startup |

---

## What Is Built Today

### ✅ Task 1 — Workspace Foundation
- npm workspaces monorepo (`apps/`, `packages/`, `services/`, `sandbox/`)
- `tsconfig.base.json` — strict TypeScript base
- `packages/schemas` — shared Zod event contracts: `ModelCallIngestSchema`, `ToolCallIngestSchema`, `CostEventSchema`, `FailureEventSchema`

### ✅ Task 2 — API Gateway + Ingest
- **`apps/api-gateway`** — Fastify 5 ingest service on port 3000
- JWT Bearer auth via `jose` (HS256; `tenantId` claim cross-checked against request body to prevent cross-tenant writes)
- `POST /v1/ingest/model-call` and `POST /v1/ingest/tool-call`
- `GET /healthz` (public liveness)
- Provider adapter pattern (`IProviderAdapter`) — swap between `mock` and `openai` via env var
- Structured pino logging on all requests

### ✅ Task 3 — Event Pipeline + Persistence
- **`packages/queue`** — `IQueue<T>` interface + `PgmqQueue<T>` implementation (send, read, delete, archive)
- **`packages/db`** — Drizzle ORM schema + repository pattern (TraceRepository, ModelCallRepository, ToolCallRepository, FailureEventRepository, AuditEventRepository), plus 6 committed SQL migration files
- **`services/analytics-workers`** — PGMQ consumers:
  - `ModelCallWorker` — upserts trace → step → model_call, calculates `cost_usd` via static pricing map, updates denormalised `totalCostUsd` / `totalTokens` on the trace row
  - `ToolCallWorker` — upserts trace → step → tool_call, auto-inserts `failure_event` when `success = false`, applies root-cause classifier
  - `AuditEventWorker` — inserts audit events, finalises trace status on `agent_end`
  - Graceful shutdown via `AbortController` on `SIGTERM`/`SIGINT`
  - Retry up to `MAX_RETRIES` (default 3) then drops with error log
- `docker-compose.yml` + `docker/init.sql` (enables `pgmq` extension) wires all services locally

### ✅ Task 4 — Control API
All query endpoints live on port 3001:

| Endpoint | Notes |
|---|---|
| `GET /v1/traces` | Cursor pagination, filter by `projectId`, `status`, `from`/`to` |
| `GET /v1/traces/:id` | Full trace with all steps, model calls, tool calls, failure events |
| `GET /v1/traces/:id/graph` | React Flow-compatible `{ nodes[], edges[] }` |
| `GET /v1/traces/:id/audit-log` | Ordered audit event timeline |
| `GET /v1/failures` | Cursor pagination, filter by `severity`, `category`, `from`/`to` |
| `GET /v1/cost/summary` | Totals + breakdown — `groupBy=day\|model\|agent` |
| `GET /health` + `GET /healthz` | Public liveness (both paths) |

- JWT auth shared via `@agent-optima/fastify-auth` plugin
- CORS allow-list for `http://localhost:5173`
- Rate limiting (300 req/min default)
- `costUsd` Drizzle `numeric` coerced to `Number` on all responses

### ✅ Task 5 — Web Dashboard
All four views are live at http://localhost:5173:

| View | Details |
|---|---|
| **Trace list** (`/traces`) | Paginated table, status badges, cost column, filter by status |
| **Trace detail** (`/traces/:id`) | Two tabs: **Graph** (React Flow, colour-coded nodes, click side panel) and **Audit Log** (expandable timeline with input/output/error payloads) |
| **Failures** (`/failures`) | Table with severity badges, category, reason; filter by severity; trace ID links to detail page |
| **Cost** (`/cost`) | Recharts bar chart + breakdown table; `groupBy=day\|model\|agent` selector |
| **Token Gate** | Paste JWT on first load; token held in-memory (not localStorage) |

### ✅ SDKs (both functional)
- **`packages/sdk-node`** — `OptimaClient` with `ingest.modelCall()`, `ingest.toolCall()`, `ingest.auditEvent()`; silent on network errors by default
- **`packages/sdk-python`** — `OptimaClient` (sync) + `AsyncOptimaClient` (async); zero dependencies (stdlib only)

### ✅ Sandbox harness (`sandbox/`)
- Mock MCP servers (`mcp-filesystem` on :4010, `mcp-web-search` on :4011) — realistic latency + occasional errors
- Mock built-in tools (calculator, code_executor, summariser, email_sender — always fails with RateLimitError)
- Three Node.js scenarios: `research-bot`, `coding-assistant` (produces failures), `multi-agent-handoff`
- Each scenario emits `auditEvent` + `modelCall`/`toolCall` ingests so all workers fire and the full dashboard is populated

### ✅ Design & Strategy Docs
- `agent-optima-design.md` — full architecture blueprint
- `docs/audit-log-integration-strategy.md` — three-layer integration model (OTEL receiver, framework adapters, manual SDK)
- `docs/sandbox-design.md` — sandbox implementation plan
- `charts/agent-optima/` — Helm chart scaffolding (partial — not yet production-ready)

---

## Known Bugs Fixed (this session)

| Bug | Fix |
|---|---|
| Graph view always blank | Replaced `useNodesState` + `useEffect` sync (races in React 19 StrictMode) with uncontrolled `defaultNodes`/`defaultEdges` + `key={traceId}` |
| `TypeError: costUsd.toFixed is not a function` | Drizzle returns Postgres `numeric` as strings; wrapped every `.toFixed(4)` call in `Number()` across all pages and node components |
| Failures tab always empty | Sandbox tracer only fired `toolCall` ingest for `model_call` events; added `tool_call` branch that also calls `client.ingest.toolCall()` |
| `groupBy=agent` returned 422 | Implemented via `INNER JOIN trace_steps` on `stepId`, grouped by `agentId` |
| `/healthz` not found | Both `api-gateway` and `control-api` now serve `/health` and `/healthz` |
| `EventFields` type error in sandbox | `kind` was not excluded from the `Omit<>` in `EventFields` |

---

## What Is Still Incomplete

### ⬜ Task 6 — Quality + Ops Baseline
- Seed script (`scripts/seed.ts`) — not created
- Smoke tests (Node built-in test runner) — not created
- `Makefile` — not created

### ⬜ Helm Chart — not production-ready
`charts/agent-optima/` has templates but needs:
- Init container on `analytics-workers` that runs DB migrations before main container
- `K8s Secret` template for `JWT_SECRET` and `DATABASE_URL`
- Readiness / liveness probes on `/healthz` (template scaffolded; not wired)
- HPA template for `analytics-workers`

### ⬜ CLI (`packages/cli`)
`optima-ctl` binary skeleton exists; `token generate` command not implemented.

### ⬜ Failure Root-Cause Classifier
Rule-based worker to tag `failure_events.root_cause` — classifier module exists (`root-cause-classifier.ts`) but runs inline in `ToolCallWorker`. A separate periodic worker that re-classifies based on pattern rules is not yet built.

---

## Phase 2 Backlog (priority order)

### 7. OTEL Receiver (Layer B)
Expose an `OTLP/HTTP` endpoint on `api-gateway` that translates incoming `gen_ai.*` semantic convention spans into Optima's internal event model. This enables zero-code integration for frameworks that already emit OpenTelemetry (AutoGen, Semantic Kernel, LangChain with OTEL plugin).

Mapping:
- `create_agent` span → `agent_start`
- `invoke_agent` span → `agent_end`
- `chat.completions` span → `model_call`
- `execute_tool` span → `tool_call` or `mcp_call`

### 8. Framework Adapters (Layer A)
Thin adapters for frameworks that do **not** emit OTEL:

| Framework | Language | Adapter approach |
|---|---|---|
| `agentic-framework` (supercog-ai) | Python | Hook into SSE event stream (`ToolCall`, `ToolResult`, `FinishCompletion`, `SubAgentCall`) |
| LangChain | Python | `BaseCallbackHandler` subclass |
| LlamaIndex | Python | `BaseCallbackHandler` / `Instrumentation` API |

Each adapter will be a separate pip-installable package (`optima-sdk-langchain`, etc.) with a single constructor arg to enable tracing.

---

## Data Model (current — 5 tables)

```
traces
  id · tenant_id · project_id · agent_id · status · started_at · ended_at · metadata

trace_steps
  id · trace_id · tenant_id · step_index · agent_id · type(model|tool) · started_at · ended_at

model_calls
  id · trace_id · step_id · tenant_id · model_provider · model_name
  input_tokens · output_tokens · latency_ms · cost_usd · requested_at · responded_at

tool_calls
  id · trace_id · step_id · tenant_id · tool_name · success · latency_ms
  error_type · requested_at · responded_at

failure_events
  id · trace_id · step_id · tenant_id · severity · category · reason · evidence · occurred_at
```

---

## Phase 2 Backlog (priority order)

### 1. Quality + Ops Baseline (Task 6)
- Seed script (`scripts/seed.ts`) — 5 traces, mixed success/failure, all event types
- Smoke tests with Node.js built-in `node --test`
- `Makefile` with `migrate`, `seed`, `test`, `build` targets

### 2. Helm Chart — production-ready
- Init container on `analytics-workers` that runs Drizzle migrations before main container starts
- `K8s Secret` template for `JWT_SECRET` and `DATABASE_URL`
- Readiness / liveness probes wired to `/healthz`
- HPA template for `analytics-workers`

### 3. CLI — `optima-ctl token generate`
```bash
optima-ctl token generate --tenant my-project --expires 365d
```
Reads `JWT_SECRET` from env or `--secret` flag, emits a signed HS256 JWT.

### 4. Failure Root-Cause Classifier (standalone worker)
Periodic worker that re-classifies `failure_events` using a rule table:

| Rule | Condition | `root_cause` |
|---|---|---|
| Rate limit | `error_type = "RateLimitError"` | `rate_limit` |
| Auth failure | `error_type = "AuthError"` | `invalid_credentials` |
| Tool timeout | `error_type = "TimeoutError"` | `tool_timeout` |
| MCP down | `tool_name` starts with `mcp-` AND `success = false` | `mcp_unavailable` |
| Context overflow | `error_type = "ContextLengthError"` | `context_overflow` |

### 5. OTEL Receiver (Layer B)
Expose an `OTLP/HTTP` endpoint on `api-gateway` that translates `gen_ai.*` semantic convention spans → Optima's internal event model. Zero-code integration for AutoGen, Semantic Kernel, LangChain OTEL plugin.

### 6. Framework Adapters (Layer A)
Thin adapters for frameworks that do **not** emit OTEL:

| Framework | Language | Approach |
|---|---|---|
| `agentic-framework` (supercog-ai) | Python | Hook into SSE event stream |
| LangChain | Python | `BaseCallbackHandler` subclass |
| LlamaIndex | Python | `Instrumentation` API |

---

## Data Model (current — 6 tables)

```
traces
  id · tenant_id · project_id · agent_id · status · started_at · ended_at
  total_cost_usd · total_tokens · metadata

trace_steps
  id · trace_id · tenant_id · step_index · agent_id · type(model|tool) · started_at · ended_at

model_calls
  id · trace_id · step_id · tenant_id · model_provider · model_name
  input_tokens · output_tokens · latency_ms · cost_usd · requested_at · responded_at

tool_calls
  id · trace_id · step_id · tenant_id · tool_name · success · latency_ms
  error_type · requested_at · responded_at

failure_events
  id · trace_id · step_id · tenant_id · severity · category · reason · evidence
  root_cause · occurred_at

audit_events
  id · trace_id · step_id · tenant_id · sequence_no · kind · actor_id · name
  input · output · latency_ms · success · error · metadata · occurred_at
```

---

## Phase 1 Task Summary

| # | Title | Status |
|---|---|---|
| 1 | Workspace foundation | ✅ Done |
| 2 | API Gateway + ingest | ✅ Done |
| 3 | Event pipeline + persistence | ✅ Done |
| 4 | Control API | ✅ Done |
| 5 | Web MVP dashboard | ✅ Done |
| 6 | Quality + ops baseline | ⬜ Pending |
