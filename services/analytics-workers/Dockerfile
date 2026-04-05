# ── Stage 1: Install production deps (cached layer) ──────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api-gateway/package.json             ./apps/api-gateway/
COPY apps/control-api/package.json             ./apps/control-api/
COPY apps/web/package.json                     ./apps/web/
COPY packages/db/package.json                  ./packages/db/
COPY packages/fastify-auth/package.json        ./packages/fastify-auth/
COPY packages/queue/package.json               ./packages/queue/
COPY packages/schemas/package.json             ./packages/schemas/
COPY services/analytics-workers/package.json   ./services/analytics-workers/

RUN npm ci --omit=dev

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api-gateway/package.json             ./apps/api-gateway/
COPY apps/control-api/package.json             ./apps/control-api/
COPY apps/web/package.json                     ./apps/web/
COPY packages/db/package.json                  ./packages/db/
COPY packages/fastify-auth/package.json        ./packages/fastify-auth/
COPY packages/queue/package.json               ./packages/queue/
COPY packages/schemas/package.json             ./packages/schemas/
COPY services/analytics-workers/package.json   ./services/analytics-workers/

RUN npm ci

COPY . .

RUN npm run build -w @agent-optima/schemas
RUN npm run build -w @agent-optima/queue
RUN npm run build -w @agent-optima/db
RUN npm run build -w @agent-optima/fastify-auth
RUN npm run build -w @agent-optima/analytics-workers

# ── Stage 3: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules

COPY --from=builder /app/packages/schemas/dist         ./packages/schemas/dist
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/package.json
COPY --from=builder /app/packages/queue/dist           ./packages/queue/dist
COPY --from=builder /app/packages/queue/package.json   ./packages/queue/package.json
COPY --from=builder /app/packages/db/dist              ./packages/db/dist
COPY --from=builder /app/packages/db/package.json      ./packages/db/package.json

# Also copy migrations so the worker can apply them on startup
COPY --from=builder /app/packages/db/migrations        ./packages/db/migrations

COPY --from=builder /app/services/analytics-workers/dist         ./services/analytics-workers/dist
COPY --from=builder /app/services/analytics-workers/package.json ./services/analytics-workers/package.json

COPY package.json ./

WORKDIR /app/services/analytics-workers
CMD ["node", "dist/index.js"]
