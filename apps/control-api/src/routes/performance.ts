import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, gte, lte, or, sql } from 'drizzle-orm';
import type { DbClient } from '@agent-optima/db';
import { auditEvents, modelCalls, toolCalls, traces } from '@agent-optima/db';
import { z } from 'zod';

const WINDOW_TO_MS: Record<'1h' | '24h' | '7d', number> = {
  '1h': 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
};

const QuerySchema = z.object({
  projectId: z.string().optional(),
  view: z.enum(['models', 'tools', 'mcps']).default('models'),
  window: z.enum(['1h', '24h', '7d']).default('24h'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  mcpName: z.string().min(1).max(256).optional(),
  q: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(10).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  direction: z.enum(['asc', 'desc']).default('desc'),
  sortBy: z
    .enum(['name', 'callCount', 'avgMs', 'p95Ms', 'p99Ms', 'successRate', 'errorCount', 'totalTokens'])
    .default('callCount'),
});

function scopedProjectIds(request: FastifyRequest, requestedProjectId?: string): string[] | null {
  const auth = (request as FastifyRequest & { auth?: { projectIds?: string[] } }).auth;
  const allowed = auth?.projectIds ?? [];
  if (allowed.length === 0) return null;
  if (!requestedProjectId) return allowed;
  if (!allowed.includes(requestedProjectId)) return null;
  return [requestedProjectId];
}

function asNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buildPerformanceRoutes(db: DbClient) {
  return async function performanceRoutes(app: FastifyInstance): Promise<void> {
    app.get('/v1/performance', async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(422).send({ error: 'InvalidQuery', issues: parsed.error.issues });
      }

      const { projectId, view, window, from, to, mcpName, q, limit, offset, direction, sortBy } = parsed.data;
      const projectIds = scopedProjectIds(request, projectId);
      if (!projectIds) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Token has no access to requested project(s)' });
      }

      const since = from ? new Date(from) : new Date(Date.now() - WINDOW_TO_MS[window]);
      const until = to ? new Date(to) : new Date();

      const scopedTraces = or(...projectIds.map((pid) => eq(traces.projectId, pid)))!;

      const mcpNameExpr = sql<string>`coalesce(${auditEvents.name}, ${auditEvents.metadata}->>'mcp', ${auditEvents.metadata}->>'server', 'unknown')`;
      const sortExpr = (() => {
        const key = sortBy;
        const dir = direction.toUpperCase();
        const map = {
          name: `name ${dir}`,
          callCount: `call_count ${dir}`,
          avgMs: `avg_ms ${dir}`,
          p95Ms: `p95_ms ${dir}`,
          p99Ms: `p99_ms ${dir}`,
          successRate: `success_rate ${dir}`,
          errorCount: `error_count ${dir}`,
          totalTokens: `total_tokens ${dir}`,
        } as const;
        const chosen = map[key as keyof typeof map] ?? `call_count ${dir}`;
        return sql.raw(chosen);
      })();

      let modelRows: Array<{ name: string; callCount: number; p50Ms: number; p95Ms: number; p99Ms: number; avgMs: number; totalTokens: number }> = [];
      let toolRows: Array<{ name: string; callCount: number; p50Ms: number; p95Ms: number; p99Ms: number; avgMs: number; successRate: number }> = [];
      let mcpRows: Array<{ name: string; callCount: number; p50Ms: number; p95Ms: number; p99Ms: number; avgMs: number; successRate: number; errorCount: number }> = [];
      let hasMore = false;

      if (view === 'models') {
        const rows = await db
          .select({
            name: modelCalls.modelName,
            callCount: sql<number>`count(*)`.as('call_count'),
            p50Ms: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${modelCalls.latencyMs}), 0)`.as('p50_ms'),
            p95Ms: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${modelCalls.latencyMs}), 0)`.as('p95_ms'),
            p99Ms: sql<number>`coalesce(percentile_cont(0.99) within group (order by ${modelCalls.latencyMs}), 0)`.as('p99_ms'),
            avgMs: sql<number>`coalesce(avg(${modelCalls.latencyMs}), 0)`.as('avg_ms'),
            totalTokens: sql<number>`coalesce(sum(${modelCalls.inputTokens} + ${modelCalls.outputTokens}), 0)`.as('total_tokens'),
          })
          .from(modelCalls)
          .innerJoin(traces, eq(modelCalls.traceId, traces.id))
          .where(
            and(
              scopedTraces,
              gte(modelCalls.createdAt, since),
              lte(modelCalls.createdAt, until),
              q ? sql`${modelCalls.modelName} ilike ${`%${q}%`}` : undefined,
            ),
          )
          .groupBy(modelCalls.modelName)
          .orderBy(sortExpr)
          .limit(limit + 1)
          .offset(offset);
        hasMore = rows.length > limit;
        modelRows = rows.slice(0, limit);
      } else if (view === 'tools') {
        const rows = await db
          .select({
            name: toolCalls.toolName,
            callCount: sql<number>`count(*)`.as('call_count'),
            p50Ms: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${toolCalls.latencyMs}), 0)`.as('p50_ms'),
            p95Ms: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${toolCalls.latencyMs}), 0)`.as('p95_ms'),
            p99Ms: sql<number>`coalesce(percentile_cont(0.99) within group (order by ${toolCalls.latencyMs}), 0)`.as('p99_ms'),
            avgMs: sql<number>`coalesce(avg(${toolCalls.latencyMs}), 0)`.as('avg_ms'),
            successRate: sql<number>`coalesce(avg(case when ${toolCalls.success} then 100 else 0 end), 0)`.as('success_rate'),
          })
          .from(toolCalls)
          .innerJoin(traces, eq(toolCalls.traceId, traces.id))
          .where(
            and(
              scopedTraces,
              gte(toolCalls.createdAt, since),
              lte(toolCalls.createdAt, until),
              q ? sql`${toolCalls.toolName} ilike ${`%${q}%`}` : undefined,
            ),
          )
          .groupBy(toolCalls.toolName)
          .orderBy(sortExpr)
          .limit(limit + 1)
          .offset(offset);
        hasMore = rows.length > limit;
        toolRows = rows.slice(0, limit);
      } else {
        const rows = await db
          .select({
            name: mcpNameExpr,
            callCount: sql<number>`count(*)`.as('call_count'),
            p50Ms: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${auditEvents.latencyMs}), 0)`.as('p50_ms'),
            p95Ms: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${auditEvents.latencyMs}), 0)`.as('p95_ms'),
            p99Ms: sql<number>`coalesce(percentile_cont(0.99) within group (order by ${auditEvents.latencyMs}), 0)`.as('p99_ms'),
            avgMs: sql<number>`coalesce(avg(${auditEvents.latencyMs}), 0)`.as('avg_ms'),
            successRate: sql<number>`coalesce(avg(case when ${auditEvents.success} is true then 100 when ${auditEvents.success} is false then 0 else null end), 0)`.as('success_rate'),
            errorCount: sql<number>`coalesce(sum(case when ${auditEvents.success} is false or ${auditEvents.error} is not null then 1 else 0 end), 0)`.as('error_count'),
          })
          .from(auditEvents)
          .innerJoin(traces, eq(auditEvents.traceId, traces.id))
          .where(
            and(
              scopedTraces,
              eq(auditEvents.kind, 'mcp_call'),
              gte(auditEvents.createdAt, since),
              lte(auditEvents.createdAt, until),
              mcpName ? sql`${mcpNameExpr} = ${mcpName}` : undefined,
              q ? sql`${mcpNameExpr} ilike ${`%${q}%`}` : undefined,
            ),
          )
          .groupBy(mcpNameExpr)
          .orderBy(sortExpr)
          .limit(limit + 1)
          .offset(offset);
        hasMore = rows.length > limit;
        mcpRows = rows.slice(0, limit);
      }

      const mcpNames = view === 'mcps'
        ? await db
            .select({
              name: mcpNameExpr,
            })
            .from(auditEvents)
            .innerJoin(traces, eq(auditEvents.traceId, traces.id))
            .where(
              and(
                scopedTraces,
                eq(auditEvents.kind, 'mcp_call'),
                gte(auditEvents.createdAt, since),
                lte(auditEvents.createdAt, until),
              ),
            )
            .groupBy(mcpNameExpr)
            .orderBy(mcpNameExpr)
            .limit(200)
        : [];

      return reply.send({
        view,
        paging: {
          limit,
          offset,
          hasMore,
        },
        window,
        from: since.toISOString(),
        to: until.toISOString(),
        selectedMcp: mcpName ?? null,
        availableMcps: mcpNames.map((r) => r.name),
        models: modelRows.map((r) => ({
          name: r.name,
          callCount: asNum(r.callCount),
          p50Ms: Math.round(asNum(r.p50Ms)),
          p95Ms: Math.round(asNum(r.p95Ms)),
          p99Ms: Math.round(asNum(r.p99Ms)),
          avgMs: Math.round(asNum(r.avgMs)),
          totalTokens: Math.round(asNum(r.totalTokens)),
        })),
        tools: toolRows.map((r) => ({
          name: r.name,
          callCount: asNum(r.callCount),
          p50Ms: Math.round(asNum(r.p50Ms)),
          p95Ms: Math.round(asNum(r.p95Ms)),
          p99Ms: Math.round(asNum(r.p99Ms)),
          avgMs: Math.round(asNum(r.avgMs)),
          successRate: Number(asNum(r.successRate).toFixed(1)),
        })),
        mcps: mcpRows.map((r) => ({
          name: r.name,
          callCount: asNum(r.callCount),
          p50Ms: Math.round(asNum(r.p50Ms)),
          p95Ms: Math.round(asNum(r.p95Ms)),
          p99Ms: Math.round(asNum(r.p99Ms)),
          avgMs: Math.round(asNum(r.avgMs)),
          successRate: Number(asNum(r.successRate).toFixed(1)),
          errorCount: Math.round(asNum(r.errorCount)),
        })),
      });
    });
  };
}
