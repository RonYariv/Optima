import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, lt, or, desc, asc, gte, lte } from 'drizzle-orm';
import type { DbClient } from '@agent-optima/db';
import {
  traces,
  traceSteps,
  modelCalls,
  toolCalls,
  failureEvents,
  auditEvents,
  type Trace,
  type TraceStep,
  type ModelCall,
  type ToolCall,
  type FailureEvent,
  type AuditEvent,
} from '@agent-optima/db';
import { decodeCursor } from '../lib/cursor.js';
import { PaginationSchema, buildPage } from '../lib/pagination.js';
import { buildTraceGraph, type StepWithDetails, type TraceWithSteps } from '../lib/build-trace-graph.js';
import { z } from 'zod';

function scopedProjectIds(request: FastifyRequest, requestedProjectId?: string): string[] | null {
  const auth = (request as FastifyRequest & { auth?: { projectIds?: string[] } }).auth;
  const allowed = auth?.projectIds ?? [];
  if (allowed.length === 0) {
    return null;
  }
  if (requestedProjectId) {
    if (!allowed.includes(requestedProjectId)) {
      return null;
    }
    return [requestedProjectId];
  }
  return allowed;
}

const QuerySchema = PaginationSchema.extend({
  projectId: z.string().optional(),
  status: z.enum(['running', 'success', 'failed', 'partial']).optional(),
});

const TraceIdParamSchema = z.object({ traceId: z.string().min(1).max(128) });

async function fetchTraceWithSteps(
  db: DbClient,
  traceId: string,
): Promise<TraceWithSteps | null> {
  // Fetch trace and steps concurrently — steps only need traceId (already known)
  const [[trace], steps] = await Promise.all([
    db
      .select()
      .from(traces)
      .where(eq(traces.id, traceId))
      .limit(1),
    db
      .select()
      .from(traceSteps)
      .where(eq(traceSteps.traceId, traceId))
      .orderBy(asc(traceSteps.stepIndex)),
  ]);

  if (!trace) return null;

  // Early exit — no child rows to fetch
  if (steps.length === 0) return { ...trace, steps: [] };

  const [mcs, tcs, fes] = await Promise.all([
    db.select().from(modelCalls).where(and(eq(modelCalls.traceId, traceId))),
    db.select().from(toolCalls).where(and(eq(toolCalls.traceId, traceId))),
    db.select().from(failureEvents).where(and(eq(failureEvents.traceId, traceId))),
  ]);

  const mcByStep = new Map<string, ModelCall[]>();
  const tcByStep = new Map<string, ToolCall[]>();
  const feByStep = new Map<string, FailureEvent[]>();

  for (const mc of mcs) {
    const list = mcByStep.get(mc.stepId) ?? [];
    list.push(mc);
    mcByStep.set(mc.stepId, list);
  }
  for (const tc of tcs) {
    const list = tcByStep.get(tc.stepId) ?? [];
    list.push(tc);
    tcByStep.set(tc.stepId, list);
  }
  for (const fe of fes) {
    const list = feByStep.get(fe.stepId) ?? [];
    list.push(fe);
    feByStep.set(fe.stepId, list);
  }

  const enrichedSteps: StepWithDetails[] = steps.map((step) => ({
    ...step,
    modelCalls: mcByStep.get(step.id) ?? [],
    toolCalls: tcByStep.get(step.id) ?? [],
    failureEvents: feByStep.get(step.id) ?? [],
  }));

  return { ...trace, steps: enrichedSteps };
}

async function getTraceProject(
  db: DbClient,
  traceId: string,
): Promise<{ id: string; projectId: string } | null> {
  const [trace] = await db
    .select({ id: traces.id, projectId: traces.projectId })
    .from(traces)
    .where(eq(traces.id, traceId))
    .limit(1);
  return trace ?? null;
}

export function buildTraceRoutes(db: DbClient) {
  return async function traceRoutes(app: FastifyInstance): Promise<void> {

    // GET /v1/traces
    app.get('/v1/traces', async (request, reply) => {
      const q = QuerySchema.safeParse(request.query);
      if (!q.success) {
        return reply.code(422).send({ error: 'InvalidQuery', issues: q.error.issues });
      }
      const { projectId, status, from, to, limit, cursor } = q.data;

      const projectIds = scopedProjectIds(request, projectId);
      if (!projectIds) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Token has no access to requested project(s)' });
      }
      const cursorData = cursor ? decodeCursor(cursor) : null;

      const conditions = [or(...projectIds.map((pid) => eq(traces.projectId, pid)))!];
      if (status) conditions.push(eq(traces.status, status));
      if (from) conditions.push(gte(traces.createdAt, new Date(from)));
      if (to) conditions.push(lte(traces.createdAt, new Date(to)));
      if (cursorData) {
        conditions.push(
          or(
            lt(traces.createdAt, new Date(cursorData.createdAt)),
            and(
              eq(traces.createdAt, new Date(cursorData.createdAt)),
              lt(traces.id, cursorData.id),
            ),
          )!,
        );
      }

      const rows = await db
        .select()
        .from(traces)
        .where(and(...conditions))
        .orderBy(desc(traces.createdAt), desc(traces.id))
        .limit(limit + 1);

      const normalized = rows.map((r) => ({
        ...r,
        totalCostUsd: r.totalCostUsd != null ? Number(r.totalCostUsd) : null,
        totalTokens:  r.totalTokens  != null ? Number(r.totalTokens)  : null,
      }));

      return reply.send(buildPage(normalized, limit));
    });

    // GET /v1/traces/:traceId
    app.get<{ Params: { traceId: string } }>('/v1/traces/:traceId', async (request, reply) => {
      const p = TraceIdParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'InvalidParam' });
      const { traceId } = p.data;

      const traceMeta = await getTraceProject(db, traceId);
      if (!traceMeta) return reply.code(404).send({ error: 'NotFound' });
      const allowed = scopedProjectIds(request, traceMeta.projectId);
      if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

      const raw = await fetchTraceWithSteps(db, traceId);
      if (!raw) return reply.code(404).send({ error: 'NotFound' });
      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.traceId, traceId))
        .orderBy(asc(auditEvents.sequenceNo));
      const trace = {
        ...raw,
        totalCostUsd: raw.totalCostUsd != null ? Number(raw.totalCostUsd) : null,
        totalTokens:  raw.totalTokens  != null ? Number(raw.totalTokens)  : null,
      };
      return reply.send({
        ...trace,
        graph: buildTraceGraph(raw, events),
      });
    });



    // GET /v1/traces/:traceId/audit-log
    app.get<{ Params: { traceId: string } }>('/v1/traces/:traceId/audit-log', async (request, reply) => {
      const p = TraceIdParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'InvalidParam' });
      const { traceId } = p.data;

      const traceMeta = await getTraceProject(db, traceId);
      if (!traceMeta) return reply.code(404).send({ error: 'NotFound' });
      const allowed = scopedProjectIds(request, traceMeta.projectId);
      if (!allowed) return reply.code(403).send({ error: 'Forbidden' });

      const events: AuditEvent[] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.traceId, traceId))
        .orderBy(asc(auditEvents.sequenceNo));

      return reply.send({ data: events });
    });
  };
}
