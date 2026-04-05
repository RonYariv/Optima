# Agent-Optima — System Status & Roadmap

> **Date:** April 5, 2026  
> **Phase:** 1 — MVP in progress

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
- **`packages/db`** — Drizzle ORM schema + repository pattern (TraceRepository, ModelCallRepository, ToolCallRepository, FailureEventRepository), plus 6 committed SQL migration files
- **`services/analytics-workers`** — PGMQ consumers:
  - `ModelCallWorker` — upserts trace → step → model_call, calculates `cost_usd` via static pricing map
  - `ToolCallWorker` — upserts trace → step → tool_call, auto-inserts `failure_event` when `success = false`
  - Graceful shutdown via `AbortController` on `SIGTERM`/`SIGINT`
  - Retry up to `MAX_RETRIES` (default 3) then drops with error log
- `docker-compose.yml` + `docker/init.sql` (enables `pgmq` extension) wires all services locally

### ✅ SDKs (both functional)
- **`packages/sdk-node`** — `OptimaClient` with `ingest.modelCall()` and `ingest.toolCall()`; silent on network errors by default
- **`packages/sdk-python`** — `OptimaClient` (sync) + `AsyncOptimaClient` (async); zero dependencies (stdlib only)

### ✅ Sandbox harness (`sandbox/`)
- Mock MCP servers (`mcp-filesystem` on :4010, `mcp-web-search` on :4011) — realistic latency + occasional errors
- Mock built-in tools (calculator, code_executor, summariser, email_sender)
- Four agent scenarios (Node.js + Python), each seeding a complete trace with all event kinds

### ✅ Design & Strategy Docs
- `agent-optima-design.md` — full architecture blueprint
- `docs/audit-log-integration-strategy.md` — three-layer integration model (OTEL receiver, framework adapters, manual SDK)
- `docs/sandbox-design.md` — sandbox implementation plan
- `charts/agent-optima/` — initial Helm chart scaffolding

---

## What Is In Progress / Incomplete

### ⬜ Task 4 — Control API
`apps/control-api` exists with skeleton but query endpoints are not yet implemented.

| Endpoint | Status |
|---|---|
| `GET /v1/traces` | Not implemented |
| `GET /v1/traces/:id` | Not implemented |
| `GET /v1/traces/:id/graph` | Not implemented |
| `GET /v1/failures` | Not implemented |
| `GET /v1/cost/summary` | Not implemented |
| `GET /healthz` | Stub exists |

### ⬜ Task 5 — Web Dashboard
`apps/web` exists (React + Vite scaffold) but pages are empty.

| View | Status |
|---|---|
| Trace list (`/traces`) | Not implemented |
| Trace detail + React Flow graph (`/traces/:id`) | Not implemented |
| Failure list (`/failures`) | Not implemented |
| Cost dashboard with charts (`/cost`) | Not implemented |
| TokenGate (paste token on first load) | Scaffold exists |

### ⬜ Task 6 — Quality + Ops Baseline
- Seed script (`scripts/seed.ts`) — not created
- Smoke tests (Node built-in test runner) — not created
- `Makefile` — not created

### ⬜ Helm Chart (partial)
`charts/agent-optima/` has scaffolding and template files but is not production-ready:
- Init container for DB migrations not wired
- K8s Secret (JWT_SECRET + DATABASE_URL) not finalised
- Readiness / liveness probes not configured

### ⬜ CLI (`packages/cli`)
`optima-ctl` binary exists as a skeleton; `token generate` command not yet implemented.

### ⬜ Failure Root-Cause Classifier
Rule-based classifier worker that tags `failure_events` with a `root_cause` field based on `error_type` + `tool_name` pattern matching — not yet built.

---

## Next Features (Priority Order)

### 1. Control API — query layer (unblocks everything else)
Complete all five endpoints in `apps/control-api`. This is the critical path — the dashboard, CLI, and external integrations all depend on it.

Key details:
- Cursor-based pagination on all list endpoints (never offset-based)
- `GET /v1/traces/:id/graph` returns React Flow-compatible `{ nodes[], edges[] }`
- CORS allow-list for `http://localhost:5173` in dev
- Reuse the same `jose` auth plugin from `api-gateway`

### 2. Web Dashboard — three core views
Once the control API is live, build the three pages in `apps/web`:

- **Trace list** — paginated table, status badges, cost column
- **Trace detail** — React Flow graph with colour-coded nodes (green/red/yellow), click-to-expand side panel, failing nodes show `reason` tooltip
- **Cost dashboard** — Recharts bar chart grouped by day, breakdown table per model (tokens + USD + avg cost per call)
- **Failure list** — filterable by severity and category, links to trace detail

### 3. Quality + Ops Baseline
- Seed script that creates 5 traces with mixed success/failure, covering all event types
- Smoke tests using Node.js built-in `node --test`: schema validation, gateway 422/200 paths, control API response shapes
- `Makefile` with `migrate`, `seed`, `test`, `build` targets

### 4. Helm Chart — production-ready
- Init container on `analytics-workers` Deployment that runs Drizzle migrations before the main container starts
- `K8s Secret` template for `JWT_SECRET` and `DATABASE_URL`
- Readiness probe on `/healthz` for all four Deployments
- HPA (HorizontalPodAutoscaler) template for `analytics-workers`

### 5. CLI — `optima-ctl token generate`
Finish `packages/cli` so operators can run:
```bash
optima-ctl token generate --tenant my-project --expires 365d
```
Uses `jose` under the hood, reads `JWT_SECRET` from env or `--secret` flag.

### 6. Failure Root-Cause Classifier
New worker in `services/analytics-workers` that consumes `failure_events` and applies a rule table:

| Rule | Condition | `root_cause` tag |
|---|---|---|
| Rate limit | `error_type = "RateLimitError"` | `rate_limit` |
| Auth failure | `error_type = "AuthError"` | `invalid_credentials` |
| Tool timeout | `error_type = "TimeoutError"` | `tool_timeout` |
| MCP down | `tool_name` starts with `mcp-*` AND `success = false` | `mcp_unavailable` |
| Model OOM | `error_type = "ContextLengthError"` | `context_overflow` |

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

## Phase 1 Task Summary

| # | Title | Status |
|---|---|---|
| 1 | Workspace foundation | ✅ Done |
| 2 | API Gateway + ingest | ✅ Done |
| 3 | Event pipeline + persistence | ✅ Done |
| 4 | Control API | ⬜ Pending |
| 5 | Web MVP dashboard | ⬜ Pending |
| 6 | Quality + ops baseline | ⬜ Pending |

**Post-Phase-1 backlog (in rough priority order):**
- Helm chart (production-ready)
- CLI (`optima-ctl`)
- Failure root-cause classifier
- OTEL receiver
- Framework adapters (LangChain, agentic, LlamaIndex)
