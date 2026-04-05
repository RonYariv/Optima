# Agent-Optima — Phase 1 MVP Task Guide

Use this file to start a fresh AI session for each subtask.
Each section is self-contained: paste the **Session Prompt** directly into a new chat.

---

## Task Status

| # | Title | Status | Commit |
|---|-------|--------|--------|
| 1 | Workspace foundation | ✅ Done | `5fb139e` |
| 2 | API Gateway + ingest | ✅ Done | `f8bd5e3` |
| 3 | Event pipeline + persistence | ✅ Done | `27c843d` |
| 4 | Control API | ⬜ Pending | — |
| 5 | Web MVP dashboard | ⬜ Pending | — |
| 6 | Quality + ops baseline | ⬜ Pending | — |

### Product TODO (Post-Phase 1)

- [ ] Add native Microsoft Agent Framework runtime event bridge so Optima ingests framework lifecycle/tool/model events automatically (no manual adapter-side event emits).

---

## Task 1 — Workspace Foundation ✅ Done

**Commit:** `5fb139e chore: bootstrap monorepo and shared event schemas`

### What was built
- npm workspaces monorepo (`apps/`, `packages/`, `services/`, `infra/`)
- `tsconfig.base.json` — strict TypeScript base extended by all packages
- `.editorconfig`, `.gitignore`, `.env.example`
- `packages/schemas` — Zod-validated shared event contracts:
  - `ModelCallIngestSchema`
  - `ToolCallIngestSchema`
  - `CostEventSchema`
  - `FailureEventSchema`

---

## Task 2 — API Gateway + Ingest ✅ Done

**Commit:** `f8bd5e3 feat(gateway): add ingest endpoints and provider adapter skeleton`

### What was built
- `apps/api-gateway` — Fastify 5 app
- `src/config.ts` — Zod-validated env config (fail-fast at startup)
- `src/plugins/auth.ts` — JWT Bearer auth via `jose` (replaced `@fastify/jwt` which had 3 unfixed CVEs in `fast-jwt`)
- `src/plugins/request-id.ts` — `X-Request-Id` tracing on every request
- `src/providers/adapter.interface.ts` — `IProviderAdapter` contract
- `src/providers/mock.adapter.ts` — deterministic mock (dev/test safe, no real tokens)
- `src/providers/openai.adapter.ts` — OpenAI stub (real `fetch`, clean error handling)
- `src/routes/health.ts` — `GET /health` (public, no auth)
- `src/routes/ingest.ts` — `POST /v1/ingest/model-call` and `POST /v1/ingest/tool-call`

### Key design decisions
- Events are currently emitted as structured pino logs (stdout). The Kafka consumer in Task 3 will tail these.
- `tenantId` in the JWT payload is cross-checked against the `tenantId` in the request body — prevents cross-tenant writes.
- Provider adapter is swapped at startup via `PROVIDER_ADAPTER=mock|openai` env var.

---

## Task 3 — Event Pipeline + Persistence ✅ Done

### Goal
Wire ingested events into a durable pipeline and persist them to the database.

### Infrastructure: Supabase + PGMQ
- **Database**: Supabase (managed PostgreSQL 16 + pgvector)
- **Queue**: PGMQ — Postgres-native message queue built into Supabase. No Redis, no Kafka, no Docker needed.
- **Future swap**: both queue and DB are behind interfaces — switching to Kafka or a different DB requires only a new adapter file.

### Commit target
`feat(pipeline): process ingestion events into trace and cost stores`

### Session Prompt (paste this into a new chat)

```
You are working on the Agent-Optima monorepo at:
  c:\Users\roooo\OneDrive\שולחן העבודה\home-projects\Optima

Project context:
- npm workspaces monorepo (Node 20, TypeScript strict ESM)
- packages/schemas — shared Zod event contracts (ModelCallIngest, ToolCallIngest, CostEvent, FailureEvent)
- apps/api-gateway — Fastify 5 gateway that currently logs ingested events as pino structured logs
- Infrastructure: Supabase (Postgres 16 + PGMQ extension). No Redis, no Kafka, no Docker.

Task: implement the event pipeline and persistence layer.

Design principle: all infrastructure is behind interfaces so technology can be swapped easily.

Requirements:
1. Create `packages/queue` (workspace package):
   - Define IQueue<T> and QueueMessage<T> interfaces
   - Implement PgmqQueue<T> using raw postgres-js SQL calls to PGMQ functions
   - PGMQ SQL: pgmq.create, pgmq.send, pgmq.read, pgmq.delete, pgmq.archive
   - Generic polling runner: runWorker(queue, handler) handles ack/nack/retry/DLQ

2. Create `packages/db` (workspace package):
   - Use Drizzle ORM with postgres-js driver
   - Define schema for:
       tenants (id, name, created_at)
       traces (id, tenant_id, project_id, agent_id, status, started_at, ended_at, metadata)
       trace_steps (id, trace_id, tenant_id, step_index, agent_id, type [model|tool], started_at, ended_at, metadata)
       model_calls (id, trace_id, step_id, tenant_id, model_provider, model_name, input_tokens, output_tokens, latency_ms, cost_usd, requested_at, responded_at)
       tool_calls (id, trace_id, step_id, tenant_id, tool_name, success, latency_ms, error_type, requested_at, responded_at)
       failure_events (id, trace_id, step_id, tenant_id, severity, category, reason, evidence, occurred_at)
   - All tables: (tenant_id, created_at) index
   - Repository pattern: TraceRepository, ModelCallRepository, ToolCallRepository, FailureEventRepository
   - drizzle.config.ts pointing at DATABASE_URL env var

3. Create `services/analytics-workers`:
   - Uses IQueue<T> + repositories (no direct DB or PGMQ imports in business logic)
   - ModelCallWorker: upsert trace → upsert step → insert model_call → compute cost_usd
   - ToolCallWorker: upsert trace → upsert step → insert tool_call → if success=false insert failure_event
   - Idempotent via stepId (upsert on conflict)
   - Static price map behind IPricingService interface

4. Update apps/api-gateway/src/routes/ingest.ts:
   - Inject IQueue via the Fastify app instance (decorate pattern)
   - Enqueue job and respond immediately — never block on DB write

5. Update .env.example with SUPABASE_DATABASE_URL

6. Commit: `feat(pipeline): process ingestion events into trace and cost stores`
```

---

## Task 4 — Control API ⬜ Pending

### Goal
Expose query endpoints so the dashboard (Task 5) and external integrations can read traces, failures, and cost summaries.

### Commit target
`feat(control-api): expose trace, failure, and cost query APIs`

### Session Prompt (paste this into a new chat)

```
You are working on the Agent-Optima monorepo at:
  c:\Users\roooo\OneDrive\שולחן העבודה\home-projects\Optima

Project context:
- npm workspaces monorepo (Node 20, TypeScript strict ESM)
- packages/schemas — Zod event contracts
- packages/db — Drizzle ORM schema + repositories (traces, trace_steps, model_calls, tool_calls, failure_events)
- packages/queue — IQueue interface + PgmqQueue adapter
- apps/api-gateway — Fastify 5 ingest gateway (runs on port 3000)
- Infrastructure: Supabase (no Docker required)

Task: build the `apps/control-api` service — a separate Fastify app that exposes read APIs for the dashboard.

Requirements:
1. Create `apps/control-api` with its own package.json + tsconfig (same stack as api-gateway)

2. Implement these endpoints (all require JWT auth, same jose-based plugin):

   GET  /v1/traces
        Query params: projectId, status, from (ISO), to (ISO), limit (default 20, max 100), cursor
        Returns: { data: Trace[], nextCursor }

   GET  /v1/traces/:traceId
        Returns full trace with all steps (model_calls + tool_calls joined per step)

   GET  /v1/traces/:traceId/graph
        Returns: { nodes: Node[], edges: Edge[] } — React Flow compatible format
        Node shape: { id, type: 'agent'|'model_call'|'tool_call', data: { label, status, latencyMs, tokens?, toolName? } }
        Edge shape: { id, source, target }

   GET  /v1/failures
        Query params: severity, category, from, to, limit, cursor
        Returns: { data: FailureEvent[], nextCursor }

   GET  /v1/cost/summary
        Query params: projectId, from, to, groupBy: 'day'|'model'|'agent'
        Returns: { totalCostUsd, breakdown: { key, costUsd, tokenCount }[] }

3. All list endpoints must use cursor-based pagination (never offset).
4. Add CORS support for the dev frontend origin (http://localhost:5173).
5. Copy the jose auth plugin from api-gateway — no @fastify/jwt.
6. Commit with: `feat(control-api): expose trace, failure, and cost query APIs`
```

---

## Task 5 — Web MVP Dashboard ⬜ Pending

### Goal
A React dashboard with three views: Trace Map, Failure Spotlight, and Cost Dashboard.

### Commit target
`feat(web): add trace map, failure highlights, and cost dashboard`

### Session Prompt (paste this into a new chat)

```
You are working on the Agent-Optima monorepo at:
  c:\Users\roooo\OneDrive\שולחן העבודה\home-projects\Optima

Project context:
- npm workspaces monorepo (Node 20, TypeScript strict ESM)
- apps/control-api runs on port 3001 — exposes REST APIs:
    GET /v1/traces, GET /v1/traces/:id, GET /v1/traces/:id/graph, GET /v1/failures, GET /v1/cost/summary
- JWT Bearer auth is required on all API calls (token stored in localStorage key `ao_token`)

Task: build `apps/web` — a React + Vite + TypeScript dashboard.

Requirements:
1. Scaffold with Vite (react-ts template). Add to workspace.

2. Dependencies: react-router-dom v6, @tanstack/react-query v5, reactflow (React Flow), recharts, tailwindcss

3. Pages / routes:
   /traces              — Trace list table with status badges and cost column
   /traces/:traceId     — Trace detail with React Flow graph
   /failures            — Failure list with severity badges; click to see trace
   /cost                — Cost dashboard

4. Trace detail page (/traces/:traceId):
   - Fetch GET /v1/traces/:traceId/graph
   - Render with React Flow
   - Color coding: green=success, red=failure, yellow=warning
   - Failing nodes show a tooltip with `reason` from the failure_event
   - Side panel opens on node click, showing step metadata

5. Cost dashboard (/cost):
   - Bar chart (recharts) grouped by day
   - Table breakdown by model showing: model name, total tokens, total cost USD, avg cost per call
   - Date range picker (from/to)

6. Failure list (/failures):
   - Filterable by severity and category
   - Each row links to the relevant trace detail

7. Global: top nav with links to all three views, tenant name from JWT payload

8. API client: typed fetch wrapper in src/lib/api.ts — reads VITE_API_URL from env, attaches Bearer token automatically

9. Commit with: `feat(web): add trace map, failure highlights, and cost dashboard`
```

---

## Task 6 — Quality + Ops Baseline ⬜ Pending

### Goal
Seed data, smoke tests, E2E happy path, Docker Compose wiring, and a developer README.

### Commit target
`chore: add tests, seed data, and MVP runbook`

### Session Prompt (paste this into a new chat)

```
You are working on the Agent-Optima monorepo at:
  c:\Users\roooo\OneDrive\שולחן העבודה\home-projects\Optima

Project context:
- Full Phase 1 stack: api-gateway (port 3000), control-api (port 3001), web (port 5173)
- packages/db — Drizzle ORM
- Infrastructure: Supabase (PostgreSQL + PGMQ — no Docker/Redis)
- PGMQ workers in services/analytics-workers

Task: add the quality and ops baseline.

Requirements:
1. Seed script at `scripts/seed.ts`:
   - Creates 1 tenant
   - Creates 5 traces with 3–8 steps each (mix of model and tool calls)
   - At least 2 traces have a failing tool_call step with a failure_event
   - Run with: `npm run seed` from repo root

2. Smoke tests (Node built-in test runner, `node --test`):
   - packages/schemas: test that valid payloads pass and invalid ones fail Zod
   - apps/api-gateway: test GET /health returns 200, POST /v1/ingest/model-call with invalid body returns 422, with valid JWT + body returns 200
   - apps/control-api: test GET /v1/traces returns 200 with cursor shape, GET /v1/traces/:id/graph returns nodes+edges

3. Add a `Makefile` at repo root with:
   make migrate      # run drizzle-kit push to Supabase
   make seed         # run seed script
   make test         # npm test across workspace
   make build        # npm run build

5. Update README.md with:
   - Prerequisites (Node 20, Docker)
   - Quick start (5 commands from clone to running dashboard)
   - Architecture diagram (ASCII)
   - Env vars table

6. Commit with: `chore: add tests, seed data, and MVP runbook`
```

---

## Current Repo Structure (after Task 3)

```
Optima/
├── apps/
│   └── api-gateway/         — ingest gateway (port 3000)
│       └── src/
│           ├── config.ts
│           ├── index.ts
│           ├── server.ts
│           ├── plugins/
│           │   ├── auth.ts
│           │   └── request-id.ts
│           ├── providers/
│           │   ├── adapter.interface.ts
│           │   ├── index.ts
│           │   ├── mock.adapter.ts
│           │   └── openai.adapter.ts
│           └── routes/
│               ├── health.ts
│               └── ingest.ts
├── packages/
│   ├── schemas/             — Zod event contracts
│   │   └── src/index.ts
│   ├── queue/               — IQueue interface + PgmqQueue adapter
│   │   └── src/
│   │       ├── queue.interface.ts
│   │       ├── pgmq.queue.ts
│   │       └── index.ts
│   └── db/                  — Drizzle schema + repositories
│       └── src/
│           ├── client.ts
│           ├── schema/
│           ├── repositories/
│           └── index.ts
├── services/
│   └── analytics-workers/   — PGMQ consumers
│       └── src/
│           ├── pricing.ts
│           ├── workers/
│           └── index.ts
├── infra/               (Task 6)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.base.json
└── README.md
```

## Infrastructure

| Concern | Technology | Swap path |
|---|---|---|
| Database | Supabase PostgreSQL | Change `packages/db/src/client.ts` |
| Queue | Supabase PGMQ | Implement new `IQueue<T>` adapter |
| Object Storage | Supabase Storage | Behind `IStorage` interface (Phase 2) |
| Auth | `jose` HS256 JWT | Swap plugin in `apps/*/plugins/auth.ts` |
