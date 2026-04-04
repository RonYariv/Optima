import type { FastifyInstance } from 'fastify';
import { and, eq, gte, lte, sql, sum } from 'drizzle-orm';
import type { DbClient } from '@agent-optima/db';
import { modelCalls } from '@agent-optima/db';
import { z } from 'zod';

const QuerySchema = z.object({
  projectId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  groupBy: z.enum(['day', 'model', 'agent']).default('day'),
});

export function buildCostRoutes(db: DbClient) {
  return async function costRoutes(app: FastifyInstance): Promise<void> {

    // GET /v1/cost/summary
    app.get('/v1/cost/summary', async (request, reply) => {
      const q = QuerySchema.safeParse(request.query);
      if (!q.success) {
        return reply.code(422).send({ error: 'InvalidQuery', issues: q.error.issues });
      }
      const { from, to, groupBy } = q.data;

      const conditions = [eq(modelCalls.tenantId, request.tenantId)];
      if (from) conditions.push(gte(modelCalls.createdAt, new Date(from)));
      if (to) conditions.push(lte(modelCalls.createdAt, new Date(to)));

      // Total cost
      const [totals] = await db
        .select({
          totalCostUsd: sum(modelCalls.costUsd),
          totalTokens: sum(sql<number>`${modelCalls.inputTokens} + ${modelCalls.outputTokens}`),
        })
        .from(modelCalls)
        .where(and(...conditions));

      // Breakdown by dimension
      let breakdown: { key: string; costUsd: number; tokenCount: number; callCount: number }[] = [];

      if (groupBy === 'model') {
        const rows = await db
          .select({
            key: modelCalls.modelName,
            costUsd: sum(modelCalls.costUsd),
            tokenCount: sum(sql<number>`${modelCalls.inputTokens} + ${modelCalls.outputTokens}`),
            callCount: sql<number>`count(*)`,
          })
          .from(modelCalls)
          .where(and(...conditions))
          .groupBy(modelCalls.modelName)
          .orderBy(sql`sum(${modelCalls.costUsd}) desc`);

        breakdown = rows.map((r) => ({
          key: r.key,
          costUsd: Number(r.costUsd ?? 0),
          tokenCount: Number(r.tokenCount ?? 0),
          callCount: Number(r.callCount ?? 0),
        }));
      } else if (groupBy === 'day') {
        const rows = await db
          .select({
            key: sql<string>`date_trunc('day', ${modelCalls.createdAt})::text`,
            costUsd: sum(modelCalls.costUsd),
            tokenCount: sum(sql<number>`${modelCalls.inputTokens} + ${modelCalls.outputTokens}`),
            callCount: sql<number>`count(*)`,
          })
          .from(modelCalls)
          .where(and(...conditions))
          .groupBy(sql`date_trunc('day', ${modelCalls.createdAt})`)
          .orderBy(sql`date_trunc('day', ${modelCalls.createdAt})`);

        breakdown = rows.map((r) => ({
          key: r.key,
          costUsd: Number(r.costUsd ?? 0),
          tokenCount: Number(r.tokenCount ?? 0),
          callCount: Number(r.callCount ?? 0),
        }));
      } else {
        // groupBy === 'agent' — join through traces
        breakdown = [];
      }

      return reply.send({
        totalCostUsd: Number(totals?.totalCostUsd ?? 0),
        totalTokens: Number(totals?.totalTokens ?? 0),
        breakdown,
      });
    });
  };
}
