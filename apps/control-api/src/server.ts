import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { authPlugin } from '@agent-optima/fastify-auth';
import { metricsPlugin } from './plugins/metrics.js';
import { healthRoutes } from './routes/health.js';
import { buildTraceRoutes } from './routes/traces.js';
import { buildFailureRoutes } from './routes/failures.js';
import { buildCostRoutes } from './routes/cost.js';
import { buildStatsRoutes } from './routes/stats.js';
import { buildPerformanceRoutes } from './routes/performance.js';
import { createDbClient } from '@agent-optima/db';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Security
  await app.register(helmet, {
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
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: config.RATE_LIMIT_WINDOW_MS });
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'OPTIONS'],
    credentials: true,
  });

  // Auth (skip for public routes)
  await app.register(authPlugin, {
    jwtSecret: config.JWT_SECRET,
    jwtIssuer: config.JWT_ISSUER,
    jwtAudience: config.JWT_AUDIENCE,
  });
  await app.register(metricsPlugin);

  // DB client — scoped to this server
  const db = createDbClient(config.DATABASE_URL, config.DATABASE_SSL === 'disable');

  // Routes
  await app.register(healthRoutes);
  await app.register(buildTraceRoutes(db));
  await app.register(buildFailureRoutes(db));
  await app.register(buildCostRoutes(db));
  await app.register(buildStatsRoutes(db));
  await app.register(buildPerformanceRoutes(db));

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) app.metrics.recordFailure('provider');
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
