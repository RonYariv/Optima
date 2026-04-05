import type { FastifyInstance } from 'fastify';
import { and, eq, lt, or, desc, gte, lte } from 'drizzle-orm';
import type { DbClient } from '@agent-optima/db';
import { failureEvents } from '@agent-optima/db';
import { decodeCursor } from '../lib/cursor.js';
import { PaginationSchema, buildPage } from '../lib/pagination.js';
import { z } from 'zod';

const QuerySchema = PaginationSchema.extend({
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.enum(['tool_error', 'provider_error', 'logic_break', 'handoff_error', 'unknown']).optional(),
});

export function buildFailureRoutes(db: DbClient) {
  return async function failureRoutes(app: FastifyInstance): Promise<void> {

    // GET /v1/failures
    app.get('/v1/failures', async (request, reply) => {
      const q = QuerySchema.safeParse(request.query);
      if (!q.success) {
        return reply.code(422).send({ error: 'InvalidQuery', issues: q.error.issues });
      }
      const { severity, category, from, to, limit, cursor } = q.data;

      const cursorData = cursor ? decodeCursor(cursor) : null;

      const conditions = [eq(failureEvents.tenantId, request.tenantId)];
      if (severity) conditions.push(eq(failureEvents.severity, severity));
      if (category) conditions.push(eq(failureEvents.category, category));
      if (from) conditions.push(gte(failureEvents.createdAt, new Date(from)));
      if (to) conditions.push(lte(failureEvents.createdAt, new Date(to)));
      if (cursorData) {
        conditions.push(
          or(
            lt(failureEvents.createdAt, new Date(cursorData.createdAt)),
            and(
              eq(failureEvents.createdAt, new Date(cursorData.createdAt)),
              lt(failureEvents.id, cursorData.id),
            ),
          )!,
        );
      }

      const rows = await db
        .select()
        .from(failureEvents)
        .where(and(...conditions))
        .orderBy(desc(failureEvents.createdAt), desc(failureEvents.id))
        .limit(limit + 1);

      return reply.send(buildPage(rows, limit));
    });
  };
}
