# ── Stage 1: Install production deps (cached layer) ──────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api-gateway/package.json             ./apps/api-gateway/
COPY apps/control-api/package.json             ./apps/control-api/
COPY apps/web/package.json                     ./apps/web/
COPY packages/db/package.json                  ./packages/db/
COPY packages/queue/package.json               ./packages/queue/
COPY packages/schemas/package.json             ./packages/schemas/
COPY packages/sdk/package.json                 ./packages/sdk/
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
COPY packages/queue/package.json               ./packages/queue/
COPY packages/schemas/package.json             ./packages/schemas/
COPY packages/sdk/package.json                 ./packages/sdk/
COPY services/analytics-workers/package.json   ./services/analytics-workers/

RUN npm ci

COPY . .

RUN npm run build -w @agent-optima/schemas
RUN npm run build -w @agent-optima/queue
RUN npm run build -w @agent-optima/db
RUN npm run build -w @agent-optima/sdk
RUN npm run build -w @agent-optima/api-gateway

# ── Stage 3: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Production npm packages (no devDeps)
COPY --from=deps /app/node_modules ./node_modules

# Workspace package built artifacts (node_modules symlinks point here)
COPY --from=builder /app/packages/schemas/dist         ./packages/schemas/dist
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/package.json
COPY --from=builder /app/packages/queue/dist           ./packages/queue/dist
COPY --from=builder /app/packages/queue/package.json   ./packages/queue/package.json
COPY --from=builder /app/packages/db/dist              ./packages/db/dist
COPY --from=builder /app/packages/db/package.json      ./packages/db/package.json
COPY --from=builder /app/packages/sdk/dist             ./packages/sdk/dist
COPY --from=builder /app/packages/sdk/package.json     ./packages/sdk/package.json

# Service
COPY --from=builder /app/apps/api-gateway/dist         ./apps/api-gateway/dist
COPY --from=builder /app/apps/api-gateway/package.json ./apps/api-gateway/package.json

# Root manifest required for npm workspace symlink resolution
COPY package.json ./

WORKDIR /app/apps/api-gateway
EXPOSE 3000
CMD ["node", "dist/index.js"]
