import Fastify from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { authPlugin } from '@agent-optima/fastify-auth';
import { queuePlugin } from './plugins/queue.js';
import { healthRoutes } from './routes/health.js';
import { buildIngestRoutes } from './routes/ingest.js';

export async function createServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Allow route-level config (used by auth plugin for public routes)
    ajv: { plugins: [] },
  });

  // ── Security ────────────────────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  });
  await app.register(fastifyRateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  // JWT verification is handled inside authPlugin via `jose`

  // ── Plugins ───────────────────────────────────────────────────────────────
  await app.register(requestIdPlugin);
  await app.register(authPlugin, {
    jwtSecret: config.JWT_SECRET,
    jwtIssuer: config.JWT_ISSUER,
    jwtAudience: config.JWT_AUDIENCE,
  });
  await app.register(queuePlugin);

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(buildIngestRoutes());

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: error.name ?? 'InternalServerError',
      message:
        statusCode >= 500 && config.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
      requestId: request.id,
    });
  });

  return app;
}
