import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

type FailureCategory = 'timeout' | 'auth' | 'validation' | 'provider';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      recordFailure: (category: FailureCategory) => void;
      render: () => Promise<string>;
      contentType: string;
    };
  }
}

export const metricsPlugin = fp(async (app: FastifyInstance) => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'optima_control_' });

  const requestsTotal = new Counter({
    name: 'ingest_requests_total',
    help: 'Total control-api requests by endpoint and status',
    labelNames: ['endpoint', 'status'] as const,
    registers: [registry],
  });

  const failuresTotal = new Counter({
    name: 'failures_total',
    help: 'Failures by category',
    labelNames: ['category'] as const,
    registers: [registry],
  });

  const requestLatency = new Histogram({
    name: 'control_request_latency_ms',
    help: 'Control API request latency in milliseconds',
    labelNames: ['endpoint'] as const,
    buckets: [5, 10, 20, 50, 75, 100, 150, 250, 500, 750, 1_000, 1_500, 2_000, 3_000],
    registers: [registry],
  });

  app.decorate('metrics', {
    recordFailure: (category: FailureCategory) => {
      failuresTotal.inc({ category });
    },
    render: () => registry.metrics(),
    contentType: registry.contentType,
  });

  app.addHook('onResponse', async (request, reply) => {
    const endpoint = request.routeOptions.url;
    requestsTotal.inc({ endpoint, status: String(reply.statusCode) });

    if (reply.statusCode === 401 || reply.statusCode === 403) {
      failuresTotal.inc({ category: 'auth' });
    }

    const duration = Number(reply.elapsedTime ?? 0);
    if (Number.isFinite(duration)) {
      requestLatency.observe({ endpoint }, Math.max(0, duration));
    }
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
});
