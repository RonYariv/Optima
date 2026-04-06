import type { FastifyInstance } from 'fastify';
import { and, gte, sql } from 'drizzle-orm';
import type { DbClient } from '@agent-optima/db';
import { modelCalls, toolCalls, auditEvents } from '@agent-optima/db';
import { z } from 'zod';
import { config } from '../config.js';

const QuerySchema = z.object({
  window: z.enum(['1h', '24h', '7d']).default('1h'),
});

const WINDOW_TO_MS: Record<'1h' | '24h' | '7d', number> = {
  '1h': 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
};

type PromMetricMap = Record<string, number>;

function parsePrometheusMetrics(metrics: string): PromMetricMap {
  const result: PromMetricMap = {};
  for (const line of metrics.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [metricWithLabels, rawValue] = trimmed.split(/\s+/);
    if (!metricWithLabels || !rawValue) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    result[metricWithLabels] = value;
  }
  return result;
}

async function fetchPromMap(url: string): Promise<PromMetricMap> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to scrape ${url}: ${res.status} ${res.statusText}`);
  }
  const payload = await res.text();
  return parsePrometheusMetrics(payload);
}

function sumQueueDepth(metrics: PromMetricMap): number {
  let total = 0;
  for (const [key, value] of Object.entries(metrics)) {
    if (key.startsWith('queue_depth{')) {
      total += value;
    }
  }
  return Math.max(0, Math.round(total));
}

function sumFailureCategories(metrics: PromMetricMap): Record<'timeout' | 'auth' | 'validation' | 'provider', number> {
  const out = {
    timeout: 0,
    auth: 0,
    validation: 0,
    provider: 0,
  };

  for (const [key, value] of Object.entries(metrics)) {
    if (!key.startsWith('failures_total{')) continue;
    if (key.includes('category="timeout"')) out.timeout += value;
    if (key.includes('category="auth"')) out.auth += value;
    if (key.includes('category="validation"')) out.validation += value;
    if (key.includes('category="provider"')) out.provider += value;
  }

  return {
    timeout: Math.round(out.timeout),
    auth: Math.round(out.auth),
    validation: Math.round(out.validation),
    provider: Math.round(out.provider),
  };
}

function numericOrZero(input: unknown): number {
  const value = Number(input ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function buildStatsRoutes(db: DbClient) {
  return async function statsRoutes(app: FastifyInstance): Promise<void> {
    app.get('/v1/stats', async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        app.metrics.recordFailure('validation');
        return reply.code(422).send({ error: 'InvalidQuery', issues: parsed.error.issues });
      }

      const window = parsed.data.window;
      const since = new Date(Date.now() - WINDOW_TO_MS[window]);
      const windowSeconds = WINDOW_TO_MS[window] / 1_000;

      const modelStatsQuery = db
        .select({
          count: sql<number>`count(*)`,
          p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${modelCalls.latencyMs}), 0)`,
          p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${modelCalls.latencyMs}), 0)`,
          p99: sql<number>`coalesce(percentile_cont(0.99) within group (order by ${modelCalls.latencyMs}), 0)`,
        })
        .from(modelCalls)
        .where(and(gte(modelCalls.createdAt, since)));

      const toolStatsQuery = db
        .select({
          count: sql<number>`count(*)`,
          p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${toolCalls.latencyMs}), 0)`,
          p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${toolCalls.latencyMs}), 0)`,
          p99: sql<number>`coalesce(percentile_cont(0.99) within group (order by ${toolCalls.latencyMs}), 0)`,
        })
        .from(toolCalls)
        .where(and(gte(toolCalls.createdAt, since)));

      const auditCountQuery = db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(auditEvents)
        .where(and(gte(auditEvents.createdAt, since)));

      const [modelRow, toolRow, auditRow] = await Promise.all([
        modelStatsQuery.then((rows) => rows[0]),
        toolStatsQuery.then((rows) => rows[0]),
        auditCountQuery.then((rows) => rows[0]),
      ]);

      const modelCount = numericOrZero(modelRow?.count);
      const toolCount = numericOrZero(toolRow?.count);
      const auditCount = numericOrZero(auditRow?.count);
      const processedEvents = modelCount + toolCount + auditCount;
      const eventsPerSecond = windowSeconds > 0 ? processedEvents / windowSeconds : 0;

      let queueDepth = 0;
      let failureTotals = { timeout: 0, auth: 0, validation: 0, provider: 0 };

      try {
        const [gatewayMetrics, workerMetrics] = await Promise.all([
          fetchPromMap(config.GATEWAY_METRICS_URL),
          fetchPromMap(config.WORKER_METRICS_URL),
        ]);
        queueDepth = sumQueueDepth(gatewayMetrics) + sumQueueDepth(workerMetrics);
        const gatewayFailures = sumFailureCategories(gatewayMetrics);
        const workerFailures = sumFailureCategories(workerMetrics);
        failureTotals = {
          timeout: gatewayFailures.timeout + workerFailures.timeout,
          auth: gatewayFailures.auth + workerFailures.auth,
          validation: gatewayFailures.validation + workerFailures.validation,
          provider: gatewayFailures.provider + workerFailures.provider,
        };
      } catch (err) {
        app.log.warn({ err }, 'Failed to scrape one or more metrics endpoints');
      }

      const drainTimeSec = eventsPerSecond > 0 ? queueDepth / eventsPerSecond : null;

      return reply.send({
        window,
        modelCall: {
          count: modelCount,
          p50Ms: Math.round(numericOrZero(modelRow?.p50)),
          p95Ms: Math.round(numericOrZero(modelRow?.p95)),
          p99Ms: Math.round(numericOrZero(modelRow?.p99)),
        },
        toolCall: {
          count: toolCount,
          p50Ms: Math.round(numericOrZero(toolRow?.p50)),
          p95Ms: Math.round(numericOrZero(toolRow?.p95)),
          p99Ms: Math.round(numericOrZero(toolRow?.p99)),
        },
        queue: {
          depth: Math.round(queueDepth),
          eventsPerSecond: Number(eventsPerSecond.toFixed(2)),
          drainTimeSec: drainTimeSec == null ? null : Number(drainTimeSec.toFixed(1)),
        },
        failures: failureTotals,
      });
    });
  };
}
