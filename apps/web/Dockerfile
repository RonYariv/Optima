# ── Stage 1: Build static assets ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy all workspace manifests (npm ci needs the full workspace graph)
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api-gateway/package.json             ./apps/api-gateway/
COPY apps/control-api/package.json             ./apps/control-api/
COPY apps/web/package.json                     ./apps/web/
COPY packages/db/package.json                  ./packages/db/
COPY packages/agentic/package.json             ./packages/agentic/
COPY packages/queue/package.json               ./packages/queue/
COPY packages/schemas/package.json             ./packages/schemas/
COPY services/analytics-workers/package.json   ./services/analytics-workers/

RUN npm ci

# Only copy the web source (other workspaces not needed for Vite build)
COPY apps/web ./apps/web
COPY packages/agentic ./packages/agentic

ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/apps/web
RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist  /usr/share/nginx/html
COPY apps/web/nginx.conf                /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
