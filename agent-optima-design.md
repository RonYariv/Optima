# Agent-Optima — Design Blueprint

Version: 2.0
Date: 2026-04-04
Status: Edge / Self-Hosted

---

## 1) Product Scope and Success Criteria

Agent-Optima is an **edge-deployable observability control plane** for AI agent systems.
It runs entirely inside the customer's own infrastructure — no data ever leaves their cluster.

Core promises:
- **Zero-egress**: all telemetry stays inside the customer's K8s namespace.
- **Minimal footprint**: 4 containers (gateway, control-api, workers, web) + Postgres. No external dependencies.
- **Seamless integration**: one SDK import + one token. Agents emit telemetry in < 5 lines of code.
- **Language-first**: first-class SDKs for **Node.js** and **Python**.
- **Instant insight**: trace map, failure highlights, and cost dashboard out of the box.

### North-Star KPIs

- Time from `helm install` to first trace visible in dashboard: **< 10 minutes**
- SDK integration effort (experienced dev): **< 30 minutes**
- Mean time to diagnose a failed run (MTTD): **< 5 minutes**
- Token cost visibility: **100%** of instrumented calls accounted for
- Gateway added latency (p95): **< 20 ms**

---

## 2) Architecture

### Deployment Model

Agent-Optima runs **inside the customer's infrastructure**. The typical deployment is a
K8s namespace with 4 pods and a Postgres instance:

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
│  │  5 tables: traces, trace_steps, model_calls,          │   │
│  │            tool_calls, failure_events                  │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Queue | PGMQ (Postgres extension) | No external broker needed; Postgres is already there |
| Auth | HS256 JWT with `tenantId` claim | Stateless; one secret to manage |
| Migrations | Drizzle Kit SQL files, auto-applied at workers startup | Zero manual steps for operators |
| SDK transport | Plain HTTP POST | Works from any language; no gRPC/WebSocket complexity |
| Web serving | nginx:alpine static build | Minimal image; no Node runtime in prod web container |

---

## 3) Stack

| Layer | Technology |
|---|---|
| API runtime | Node.js 20, TypeScript, Fastify 5 |
| ORM / DB | Drizzle ORM + postgres-js, Postgres 16 |
| Queue | PGMQ (Postgres extension) |
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Flow, Recharts |
| SDK (Node.js) | Zero-dependency ESM package (`@agent-optima/sdk-node`) |
| SDK (Python) | Zero-dependency stdlib package (`optima-sdk`) |
| Containerisation | Docker multi-stage builds, docker-compose, Helm (planned) |
| Migrations | Drizzle Kit — SQL files committed, applied programmatically |

---

## 4) Data Model

5 tables. `tenant_id` is a plain text column (no FK) — useful as a project/team
label within a single deployment. No `tenants` table; no multi-tenancy overhead.

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

### Indexes

- `(tenant_id, created_at)` on all tables — default list queries
- `(trace_id, step_index)` on `trace_steps` — graph reconstruction

---

## 5) SDK Integration

The SDK is the primary integration surface. It must be **invisible in the happy path**
and **silent on errors** (never crash the customer's agent).

### Node.js

```ts
import { OptimaClient } from '@agent-optima/sdk';

const optima = new OptimaClient({
  url: process.env.OPTIMA_URL,   // e.g. http://optima-gateway:3000
  token: process.env.OPTIMA_TOKEN,
  silent: true,                  // default — swallows network errors
});

const t0 = Date.now();
const res = await openai.chat.completions.create({ model: 'gpt-4o', messages });

await optima.ingest.modelCall({
  tenantId: 'my-project',
  projectId: 'sales-agent',
  traceId: ctx.traceId,
  stepId: crypto.randomUUID(),
  agentId: 'sales-agent-v2',
  modelProvider: 'openai',
  modelName: 'gpt-4o',
  inputTokens: res.usage.prompt_tokens,
  outputTokens: res.usage.completion_tokens,
  latencyMs: Date.now() - t0,
  requestAt: new Date(t0).toISOString(),
  responseAt: new Date().toISOString(),
});
```

### Python (sync)

```python
from optima_sdk import OptimaClient
import os, time, uuid
from datetime import datetime, timezone

optima = OptimaClient(
    url=os.environ["OPTIMA_URL"],
    token=os.environ["OPTIMA_TOKEN"],
)

t0 = time.time()
response = openai_client.chat.completions.create(model="gpt-4o", messages=messages)

optima.ingest.model_call(
    tenant_id="my-project",
    project_id="sales-agent",
    trace_id=ctx.trace_id,
    step_id=str(uuid.uuid4()),
    agent_id="sales-agent-v2",
    model_provider="openai",
    model_name="gpt-4o",
    input_tokens=response.usage.prompt_tokens,
    output_tokens=response.usage.completion_tokens,
    latency_ms=int((time.time() - t0) * 1000),
    request_at=datetime.fromtimestamp(t0, tz=timezone.utc).isoformat(),
    response_at=datetime.now(tz=timezone.utc).isoformat(),
)
```

### Python (async)

```python
from optima_sdk import AsyncOptimaClient

optima = AsyncOptimaClient(url=os.environ["OPTIMA_URL"], token=os.environ["OPTIMA_TOKEN"])
await optima.ingest.model_call(...)
```

---

## 6) Auth Flow

1. Operator generates a long-lived JWT at install time.
2. Token is stored as a K8s Secret and injected as `OPTIMA_TOKEN` into agent pods.
3. Dashboard users paste the same token on first load (stored in `localStorage`).

No user accounts, no OAuth, no user DB. One secret per deployment.

---

## 7) API Endpoints

### Ingest (api-gateway :3000)

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/ingest/model-call` | Record an LLM call |
| `POST` | `/v1/ingest/tool-call` | Record a tool/function call |
| `GET` | `/healthz` | Liveness (public) |

### Query (control-api :3001)

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/traces` | Paginated trace list |
| `GET` | `/v1/traces/:id` | Single trace + steps |
| `GET` | `/v1/traces/:id/graph` | React Flow nodes + edges |
| `GET` | `/v1/failures` | Failure events |
| `GET` | `/v1/cost/summary` | Per-model cost aggregation |
| `GET` | `/healthz` | Liveness (public) |

---

## 8) Event Pipeline

```
SDK  POST /v1/ingest/model-call
  → api-gateway: JWT auth + Zod schema validation
  → PGMQ enqueue  (fire-and-forget, ~1 ms overhead)
  → HTTP 202 returned to SDK

PGMQ model-call-ingest queue
  → analytics-workers poll every 1 s
  → upsert trace + trace_step
  → insert model_call with cost calculation
  → archive (ack) message
```

Workers use `AbortController` for graceful shutdown on `SIGTERM` / `SIGINT`.
Failed messages are retried up to `MAX_RETRIES` (default 3) then dropped with error log.

---

## 9) Deployment

### Local (docker-compose)

```bash
cp .env.example .env
# Set JWT_SECRET (openssl rand -hex 32) and POSTGRES_PASSWORD
docker compose up --build
```

| Service | URL |
|---|---|
| api-gateway (ingest) | http://localhost:3000 |
| control-api (dashboard backend) | http://localhost:3001 |
| Web dashboard | http://localhost:5173 |

### Kubernetes (Helm — planned)

The `analytics-workers` Deployment runs DB migrations as an init container —
no `kubectl exec` or manual migration step needed.

---

## 10) Repository Layout

```
apps/
  api-gateway/       Fastify ingest API (JWT auth, PGMQ enqueue)
  control-api/       Fastify query API (traces, failures, cost)
  web/               React + Vite dashboard (React Flow, Recharts)

packages/
  schemas/           Zod contracts shared across gateway + workers
  db/                Drizzle ORM client + repositories + migrations
  queue/             PGMQ abstraction (IQueue<T> interface)
  sdk/               Node.js SDK (zero deps, ESM)
  sdk-python/        Python SDK (zero deps, stdlib only)

services/
  analytics-workers/ PGMQ consumers, cost calc, failure classification

docker/
  init.sql           CREATE EXTENSION IF NOT EXISTS pgmq
```

---

## 11) Reliability

- **Durability**: PGMQ persists messages in Postgres — survives pod restarts.
- **At-least-once delivery**: workers ack only after successful DB write.
- **Graceful shutdown**: `SIGTERM` drains in-flight messages before exit.
- **Migrations**: auto-applied at workers startup; idempotent via Drizzle migration table.
- **Silent SDK**: network errors never propagate to the customer's agent process.

---

## 12) Roadmap

### Now (MVP ✅)
- Dockerfiles + docker-compose
- Node.js + Python SDKs
- Trace map, failure dashboard, cost dashboard
- Auto-migrations on startup

### Next
- Helm chart with readiness/liveness probes and resource limits
- `optima-ctl token generate` CLI (replace manual Node one-liner)
- Streaming bulk ingest endpoint (high-throughput agents)
- Failure root-cause classifier (rule-based, no ML required)

### Later
- Prompt slimming recommender
- Smart model routing by task + quality tier
- Agent loop detector with configurable kill-switch
- OpenTelemetry trace export (OTLP)
