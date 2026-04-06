import { createServer, type Server } from 'node:http';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
} from 'prom-client';

type FailureCategory = 'timeout' | 'auth' | 'validation' | 'provider';

const LATENCY_BUCKETS_MS = [
  10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000,
];

export interface WorkerMetrics {
  recordModelLatency(latencyMs: number): void;
  recordToolLatency(latencyMs: number): void;
  recordFailure(category: FailureCategory): void;
  setQueueDepth(queueName: string, depth: number): void;
  close(): Promise<void>;
}

function normalizeLatency(latencyMs: number): number {
  if (!Number.isFinite(latencyMs)) return 0;
  return Math.max(0, Math.round(latencyMs));
}

export function startWorkerMetricsServer(host: string, port: number): WorkerMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'optima_worker_' });

  const failuresTotal = new Counter({
    name: 'failures_total',
    help: 'Failures by category',
    labelNames: ['category'] as const,
    registers: [registry],
  });

  const modelCallLatency = new Histogram({
    name: 'model_call_latency_ms',
    help: 'Model-call worker processing latency in milliseconds',
    buckets: LATENCY_BUCKETS_MS,
    registers: [registry],
  });

  const toolCallLatency = new Histogram({
    name: 'tool_call_latency_ms',
    help: 'Tool-call worker processing latency in milliseconds',
    buckets: LATENCY_BUCKETS_MS,
    registers: [registry],
  });

  const queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Pending messages in queue by queue name',
    labelNames: ['queue'] as const,
    registers: [registry],
  });

  const server: Server = createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const payload = await registry.metrics();
    res.statusCode = 200;
    res.setHeader('Content-Type', registry.contentType);
    res.end(payload);
  });

  server.listen(port, host, () => {
    console.log(`Worker metrics available at http://${host}:${port}/metrics`);
  });

  return {
    recordModelLatency(latencyMs: number) {
      modelCallLatency.observe(normalizeLatency(latencyMs));
    },
    recordToolLatency(latencyMs: number) {
      toolCallLatency.observe(normalizeLatency(latencyMs));
    },
    recordFailure(category: FailureCategory) {
      failuresTotal.inc({ category });
    },
    setQueueDepth(queueName: string, depth: number) {
      queueDepth.set({ queue: queueName }, Math.max(0, Number(depth) || 0));
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
