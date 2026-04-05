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
const token = await new SignJWT({ 
  sub: 'my-agent',
  role: 'writer',
  projects: ['my-project'] // scoped to these project IDs
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer('agent-optima')
  .setAudience('agent-optima-api')
  .setExpirationTime('365d')
  .sign(key);
console.log(token);
EOF
```

Paste this token in the dashboard on first load, and set it as `OPTIMA_TOKEN` in your agent.

## Direct HTTP Ingest — Node.js

```bash
# local (monorepo)
npm install
```

```ts
const OPTIMA_URL = process.env.OPTIMA_URL;       // http://optima-gateway:3000
const OPTIMA_TOKEN = process.env.OPTIMA_TOKEN;   // Bearer token with projects scope

const t0 = Date.now();
const res = await openai.chat.completions.create({ model: 'gpt-4o', messages });

await fetch(`${OPTIMA_URL}/v1/ingest/model-call`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPTIMA_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    projectId: 'sales-agent',  // must match token scope
    traceId: ctx.traceId,
    stepId: crypto.randomUUID(),
    stepIndex: 0,
    agentId: 'sales-agent-v2',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    inputTokens: res.usage.prompt_tokens,
    outputTokens: res.usage.completion_tokens,
    latencyMs: Date.now() - t0,
    requestAt: new Date(t0).toISOString(),
    responseAt: new Date().toISOString(),
  }),
});
```

## Direct HTTP Ingest — Python

```bash
pip install httpx
```

```python
import os, time, uuid
from datetime import datetime, timezone
import httpx

optima_url = os.environ["OPTIMA_URL"]
optima_token = os.environ["OPTIMA_TOKEN"]

t0 = time.time()
response = openai_client.chat.completions.create(model="gpt-4o", messages=messages)

httpx.post(
  f"{optima_url}/v1/ingest/model-call",
  headers={"Authorization": f"Bearer {optima_token}"},
  json={
    "projectId": "sales-agent",
    "traceId": ctx.trace_id,
    "stepId": str(uuid.uuid4()),
    "stepIndex": 0,
    "agentId": "sales-agent-v2",
    "modelProvider": "openai",
    "modelName": "gpt-4o",
    "inputTokens": response.usage.prompt_tokens,
    "outputTokens": response.usage.completion_tokens,
    "latencyMs": int((time.time() - t0) * 1000),
    "requestAt": datetime.fromtimestamp(t0, tz=timezone.utc).isoformat(),
    "responseAt": datetime.now(tz=timezone.utc).isoformat(),
  },
)
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
