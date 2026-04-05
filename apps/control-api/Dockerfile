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
COPY packages/sdk-node/package.json            ./packages/sdk-node/
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
COPY packages/sdk-node/package.json            ./packages/sdk-node/
COPY services/analytics-workers/package.json   ./services/analytics-workers/

RUN npm ci

COPY . .

RUN npm run build -w @agent-optima/schemas
RUN npm run build -w @agent-optima/fastify-auth
RUN npm run build -w @agent-optima/db
RUN npm run build -w @agent-optima/sdk-node
RUN npm run build -w @agent-optima/control-api

# ── Stage 3: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules

COPY --from=builder /app/packages/schemas/dist         ./packages/schemas/dist
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/package.json
COPY --from=builder /app/packages/fastify-auth/dist    ./packages/fastify-auth/dist
COPY --from=builder /app/packages/fastify-auth/package.json ./packages/fastify-auth/package.json
COPY --from=builder /app/packages/db/dist              ./packages/db/dist
COPY --from=builder /app/packages/db/package.json      ./packages/db/package.json
COPY --from=builder /app/packages/sdk-node/dist        ./packages/sdk-node/dist
COPY --from=builder /app/packages/sdk-node/package.json ./packages/sdk-node/package.json

COPY --from=builder /app/apps/control-api/dist         ./apps/control-api/dist
COPY --from=builder /app/apps/control-api/package.json ./apps/control-api/package.json

COPY package.json ./

WORKDIR /app/apps/control-api
EXPOSE 3001
CMD ["node", "dist/index.js"]
