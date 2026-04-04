# Agent-Optima

Self-hosted observability for AI agent systems. Runs entirely inside your own
infrastructure — no data ever leaves your cluster.

## What it does

- **Trace map** — visualise every step of an agent run as an interactive graph
- **Failure dashboard** — surfaced failures with severity and category
- **Cost dashboard** — per-model token spend over time
- **SDKs** — Node.js and Python clients that emit telemetry in < 5 lines of code

## Quick Start (docker-compose)

```bash
# 1. Clone and configure
git clone https://github.com/RonYariv/Optima.git && cd Optima
cp .env.example .env
# Edit .env — set JWT_SECRET (openssl rand -hex 32) and POSTGRES_PASSWORD

# 2. Start everything
docker compose up --build
```

Services come up at:
| Service | URL |
|---|---|
| Web dashboard | http://localhost:5173 |
| API gateway (ingest) | http://localhost:3000 |
| Control API (dashboard backend) | http://localhost:3001 |

## Generate an API Token

```bash
node --input-type=module <<'EOF'
import { SignJWT } from 'jose';
const key = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ sub: 'myapp', tenantId: 'myapp' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer('agent-optima')
  .setAudience('agent-optima-api')
  .setExpirationTime('365d')
  .sign(key);
console.log(token);
EOF
```

Paste this token in the dashboard on first load, and set it as `OPTIMA_TOKEN` in your agent.

## SDK — Node.js

```bash
# local (monorepo)
npm install
```

```ts
import { OptimaClient } from '@agent-optima/sdk';

const optima = new OptimaClient({
  url: process.env.OPTIMA_URL,    // http://optima-gateway:3000
  token: process.env.OPTIMA_TOKEN,
});

const t0 = Date.now();
const res = await openai.chat.completions.create({ model: 'gpt-4o', messages });

await optima.ingest.modelCall({
  tenantId: 'my-project', projectId: 'sales-agent',
  traceId: ctx.traceId,   stepId: crypto.randomUUID(),
  agentId: 'sales-agent-v2',
  modelProvider: 'openai', modelName: 'gpt-4o',
  inputTokens: res.usage.prompt_tokens,
  outputTokens: res.usage.completion_tokens,
  latencyMs: Date.now() - t0,
  requestAt: new Date(t0).toISOString(),
  responseAt: new Date().toISOString(),
});
```

## SDK — Python

```bash
pip install optima-sdk   # once published; or: pip install ./packages/sdk-python
```

```python
from optima_sdk import OptimaClient
import os, time, uuid
from datetime import datetime, timezone

optima = OptimaClient(url=os.environ["OPTIMA_URL"], token=os.environ["OPTIMA_TOKEN"])

t0 = time.time()
response = openai_client.chat.completions.create(model="gpt-4o", messages=messages)

optima.ingest.model_call(
    tenant_id="my-project",   project_id="sales-agent",
    trace_id=ctx.trace_id,    step_id=str(uuid.uuid4()),
    agent_id="sales-agent-v2",
    model_provider="openai",  model_name="gpt-4o",
    input_tokens=response.usage.prompt_tokens,
    output_tokens=response.usage.completion_tokens,
    latency_ms=int((time.time() - t0) * 1000),
    request_at=datetime.fromtimestamp(t0, tz=timezone.utc).isoformat(),
    response_at=datetime.now(tz=timezone.utc).isoformat(),
)
```

Async version:
```python
from optima_sdk import AsyncOptimaClient
optima = AsyncOptimaClient(url=..., token=...)
await optima.ingest.model_call(...)
```

## Workspace Layout

```
apps/
  api-gateway/       Ingest API  — JWT auth, PGMQ enqueue
  control-api/       Query API   — traces, failures, cost
  web/               React dashboard

packages/
  schemas/           Shared Zod contracts
  db/                Drizzle ORM + repositories + migrations
  queue/             PGMQ abstraction
  sdk/               Node.js SDK
  sdk-python/        Python SDK

services/
  analytics-workers/ PGMQ consumers — cost calc, failure classification
```

## Development

```bash
npm install
npm run build        # build all packages and apps
```

See [agent-optima-design.md](agent-optima-design.md) for full architecture documentation.


This commit bootstraps repository standards and shared event schemas.
