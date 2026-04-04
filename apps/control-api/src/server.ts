import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { buildTraceRoutes } from './routes/traces.js';
import { buildFailureRoutes } from './routes/failures.js';
import { buildCostRoutes } from './routes/cost.js';
import { createDbClient } from '@agent-optima/db';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Security
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'OPTIONS'],
    credentials: true,
  });

  // Auth (skip for public routes)
  await app.register(authPlugin);

  // DB client — scoped to this server
  const db = createDbClient(config.DATABASE_URL);

  // Routes
  await app.register(healthRoutes);
  await app.register(buildTraceRoutes(db));
  await app.register(buildFailureRoutes(db));
  await app.register(buildCostRoutes(db));

  return app;
}
