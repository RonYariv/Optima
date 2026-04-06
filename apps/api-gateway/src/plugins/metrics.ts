import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
} from 'prom-client';

type FailureCategory = 'timeout' | 'auth' | 'validation' | 'provider';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      recordModelLatency: (latencyMs: number) => void;
      recordToolLatency: (latencyMs: number) => void;
      recordFailure: (category: FailureCategory) => void;
      setQueueDepth: (queueName: string, depth: number) => void;
      render: () => Promise<string>;
      contentType: string;
    };
  }
}

const LATENCY_BUCKETS_MS = [
  10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000,
];

function normalizeLatency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export const metricsPlugin = fp(async (app: FastifyInstance) => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'optima_gateway_' });

  const ingestRequestsTotal = new Counter({
    name: 'ingest_requests_total',
    help: 'Total ingest requests by endpoint and status',
    labelNames: ['endpoint', 'status'] as const,
    registers: [registry],
  });

  const failuresTotal = new Counter({
    name: 'failures_total',
    help: 'Failures by category',
    labelNames: ['category'] as const,
    registers: [registry],
  });

  const toolCallLatency = new Histogram({
    name: 'tool_call_latency_ms',
    help: 'Tool-call latency in milliseconds',
    buckets: LATENCY_BUCKETS_MS,
    registers: [registry],
  });

  const modelCallLatency = new Histogram({
    name: 'model_call_latency_ms',
    help: 'Model-call latency in milliseconds',
    buckets: LATENCY_BUCKETS_MS,
    registers: [registry],
  });

  const queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Pending messages in queue by queue name',
    labelNames: ['queue'] as const,
    registers: [registry],
  });

  app.decorate('metrics', {
    recordModelLatency: (latencyMs: number) => {
      modelCallLatency.observe(normalizeLatency(latencyMs));
    },
    recordToolLatency: (latencyMs: number) => {
      toolCallLatency.observe(normalizeLatency(latencyMs));
    },
    recordFailure: (category: FailureCategory) => {
      failuresTotal.inc({ category });
    },
    setQueueDepth: (queueName: string, depth: number) => {
      queueDepth.set({ queue: queueName }, Math.max(0, Number(depth) || 0));
    },
    render: () => registry.metrics(),
    contentType: registry.contentType,
  });

  app.addHook('onResponse', async (request, reply) => {
    const endpoint = request.routeOptions.url ?? 'unknown';
    if (endpoint.startsWith('/v1/ingest/')) {
      ingestRequestsTotal.inc({ endpoint, status: String(reply.statusCode) });
    }

    if (reply.statusCode === 401 || reply.statusCode === 403) {
      failuresTotal.inc({ category: 'auth' });
    }
  });

  const updateQueueDepth = async (): Promise<void> => {
    if (!app.queues) return;

    for (const [queueName, queue] of Object.entries(app.queues)) {
      const maybeDepth = (queue as { depth?: () => Promise<number> }).depth;
      if (typeof maybeDepth !== 'function') continue;
      try {
        const depth = await maybeDepth();
        queueDepth.set({ queue: queueName }, Math.max(0, Number(depth) || 0));
      } catch (err) {
        app.log.debug({ err, queueName }, 'Failed to update queue depth metric');
      }
    }
  };

  const queueDepthInterval = setInterval(() => {
    void updateQueueDepth();
  }, 5_000);
  queueDepthInterval.unref();

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  app.addHook('onClose', async () => {
    clearInterval(queueDepthInterval);
  });
});
