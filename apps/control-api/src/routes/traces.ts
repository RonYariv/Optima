import type { FastifyInstance } from 'fastify';
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
import { encodeCursor, decodeCursor } from '../lib/cursor.js';
import { PaginationSchema } from '../lib/pagination.js';
import { z } from 'zod';

const QuerySchema = PaginationSchema.extend({
  projectId: z.string().optional(),
  status: z.enum(['running', 'success', 'failed', 'partial']).optional(),
});

const TraceIdParamSchema = z.object({ traceId: z.string().min(1).max(128) });

type StepWithDetails = TraceStep & {
  modelCalls: ModelCall[];
  toolCalls: ToolCall[];
  failureEvents: FailureEvent[];
};

type RFNode = {
  id: string;
  type: 'agent' | 'model_call' | 'tool_call';
  position: { x: number; y: number };
  data: Record<string, unknown>;
};
type RFEdge = { id: string; source: string; target: string };

const GRAPH_STEP_HEIGHT_PX = 120;

async function fetchTraceWithSteps(
  db: DbClient,
  traceId: string,
  tenantId: string,
): Promise<(Trace & { steps: StepWithDetails[] }) | null> {
  // Fetch trace and steps concurrently — steps only need traceId (already known)
  const [[trace], steps] = await Promise.all([
    db
      .select()
      .from(traces)
      .where(and(eq(traces.id, traceId), eq(traces.tenantId, tenantId)))
      .limit(1),
    db
      .select()
      .from(traceSteps)
      .where(eq(traceSteps.traceId, traceId))
      .orderBy(asc(traceSteps.stepIndex)),
  ]);

  if (!trace) return null;

  const stepIds = steps.map((s) => s.id);
  if (stepIds.length === 0) return { ...trace, steps: [] };

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

export function buildTraceRoutes(db: DbClient) {
  return async function traceRoutes(app: FastifyInstance): Promise<void> {

    // GET /v1/traces
    app.get('/v1/traces', async (request, reply) => {
      const q = QuerySchema.safeParse(request.query);
      if (!q.success) {
        return reply.code(422).send({ error: 'InvalidQuery', issues: q.error.issues });
      }
      const { projectId, status, from, to, limit, cursor } = q.data;
      const tenantId = request.tenantId;

      const cursorData = cursor ? decodeCursor(cursor) : null;

      const conditions = [eq(traces.tenantId, tenantId)];
      if (projectId) conditions.push(eq(traces.projectId, projectId));
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

      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const last = data.at(-1);
      const nextCursor =
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null;

      return reply.send({ data, nextCursor });
    });

    // GET /v1/traces/:traceId
    app.get<{ Params: { traceId: string } }>('/v1/traces/:traceId', async (request, reply) => {
      const p = TraceIdParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'InvalidParam' });
      const { traceId } = p.data;
      const trace = await fetchTraceWithSteps(db, traceId, request.tenantId);
      if (!trace) return reply.code(404).send({ error: 'NotFound' });
      return reply.send(trace);
    });

    // GET /v1/traces/:traceId/graph  — React Flow compatible
    app.get<{ Params: { traceId: string } }>('/v1/traces/:traceId/graph', async (request, reply) => {
      const p = TraceIdParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'InvalidParam' });
      const { traceId } = p.data;
      const trace = await fetchTraceWithSteps(db, traceId, request.tenantId);
      if (!trace) return reply.code(404).send({ error: 'NotFound' });

      const nodes: RFNode[] = [];
      const edges: RFEdge[] = [];

      const rootId = `agent-${trace.agentId}`;
      nodes.push({
        id: rootId,
        type: 'agent',
        position: { x: 0, y: 0 },
        data: { label: trace.agentId, status: trace.status },
      });

      trace.steps.forEach((step: StepWithDetails, i: number) => {
        const failure = step.failureEvents[0] ?? null;
        const stepStatus = failure ? 'failed' : 'success';
        const yPos = (i + 1) * GRAPH_STEP_HEIGHT_PX;

        if (step.type === 'model') {
          const mc = step.modelCalls[0] ?? null;
          nodes.push({
            id: step.id,
            type: 'model_call',
            position: { x: 0, y: yPos },
            data: {
              label: mc?.modelName ?? step.agentId,
              status: stepStatus,
              latencyMs: mc?.latencyMs ?? null,
              inputTokens: mc?.inputTokens ?? null,
              outputTokens: mc?.outputTokens ?? null,
              costUsd: mc?.costUsd ?? null,
              failureReason: failure?.reason ?? null,
            },
          });
        } else {
          const tc = step.toolCalls[0] ?? null;
          nodes.push({
            id: step.id,
            type: 'tool_call',
            position: { x: 0, y: yPos },
            data: {
              label: tc?.toolName ?? step.agentId,
              status: stepStatus,
              latencyMs: tc?.latencyMs ?? null,
              success: tc?.success ?? null,
              errorType: tc?.errorType ?? null,
              failureReason: failure?.reason ?? null,
            },
          });
        }

        const sourceId = i === 0 ? rootId : (trace.steps[i - 1] as StepWithDetails).id;
        edges.push({ id: `e-${sourceId}-${step.id}`, source: sourceId, target: step.id });
      });

      return reply.send({ nodes, edges });
    });

    // GET /v1/traces/:traceId/audit-log
    app.get<{ Params: { traceId: string } }>('/v1/traces/:traceId/audit-log', async (request, reply) => {
      const p = TraceIdParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: 'InvalidParam' });
      const { traceId } = p.data;
      const tenantId = request.tenantId;

      // Verify the trace belongs to this tenant before returning events
      const [trace] = await db
        .select({ id: traces.id })
        .from(traces)
        .where(and(eq(traces.id, traceId), eq(traces.tenantId, tenantId)))
        .limit(1);

      if (!trace) return reply.code(404).send({ error: 'NotFound' });

      const events: AuditEvent[] = await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.traceId, traceId), eq(auditEvents.tenantId, tenantId)))
        .orderBy(asc(auditEvents.sequenceNo));

      return reply.send({ data: events });
    });
  };
}
