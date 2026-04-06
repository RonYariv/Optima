import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ModelCallIngestSchema,
  ToolCallIngestSchema,
  AuditEventIngestSchema,
  type ModelCallIngest,
  type ToolCallIngest,
  type AuditEventIngest,
} from '@agent-optima/schemas';

/**
 * Structural interface for any Zod-like schema.
 * Using a structural type instead of ZodType<T> avoids the input/output
 * generic split that causes TypeScript errors with .default() fields.
 */
interface SafeParser<T> {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } };
}

/**
 * Validate body with schema.
 * Sends 422 and returns null on failure so the caller can early-return.
 */
function parseBody<T>(
  schema: SafeParser<T>,
  body: unknown,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    reply.code(422).send({
      error: 'UnprocessableEntity',
      message: 'Invalid payload',
      issues: parsed.error.issues,
    });
    return null;
  }
  return parsed.data;
}

/**
 * Ingest routes — receive raw model/tool call telemetry from customer agents.
 *
 * Flow:
 *  1. Validate payload (Zod)
 *  2. Enqueue job for async processing by analytics-workers
 *  3. Respond immediately (202 Accepted) — never block on writes or provider calls
 *
 * If the queue is unavailable (DATABASE_URL not set / mock mode),
 * events are emitted as structured pino logs only — no data loss for dev.
 */
export function buildIngestRoutes() {
  return async function ingestRoutes(app: FastifyInstance): Promise<void> {

    app.post<{ Body: ModelCallIngest }>(
      '/v1/ingest/model-call',
      async (request, reply) => {
        const data = parseBody(ModelCallIngestSchema, request.body, reply);
        if (!data) {
          request.server.metrics.recordFailure('validation');
          return;
        }

        request.server.metrics.recordModelLatency(data.latencyMs);

        // Fire-and-forget enqueue — never block the response
        try {
          if (app.queues) {
            await app.queues.modelCall.enqueue(data);
          } else {
            request.log.info({ event: 'model_call_ingested', ...data }, 'model_call_ingested');
          }
        } catch (err: unknown) {
          request.log.error({ err, traceId: data.traceId }, 'Failed to enqueue model-call');
          request.server.metrics.recordFailure('provider');
          return reply.code(503).send({
            error: 'QueueUnavailable',
            message: 'Telemetry ingest is temporarily unavailable',
          });
        }

        return reply.code(202).send({
          traceId: data.traceId,
          stepId: data.stepId,
          acknowledged: true,
        });
      },
    );

    // ── POST /v1/ingest/tool-call ──────────────────────────────────────────
    app.post<{ Body: ToolCallIngest }>(
      '/v1/ingest/tool-call',
      async (request, reply) => {
        const data = parseBody(ToolCallIngestSchema, request.body, reply);
        if (!data) {
          request.server.metrics.recordFailure('validation');
          return;
        }

        request.server.metrics.recordToolLatency(data.latencyMs);

        try {
          if (app.queues) {
            await app.queues.toolCall.enqueue(data);
          } else {
            request.log.info({ event: 'tool_call_ingested', ...data }, 'tool_call_ingested');
          }
        } catch (err: unknown) {
          request.log.error({ err, traceId: data.traceId }, 'Failed to enqueue tool-call');
          request.server.metrics.recordFailure('provider');
          return reply.code(503).send({
            error: 'QueueUnavailable',
            message: 'Telemetry ingest is temporarily unavailable',
          });
        }

        return reply.code(202).send({
          traceId: data.traceId,
          stepId: data.stepId,
          acknowledged: true,
        });
      },
    );

    // ── POST /v1/ingest/audit-event ────────────────────────────────────────
    app.post<{ Body: AuditEventIngest }>(
      '/v1/ingest/audit-event',
      async (request, reply) => {
        const data = parseBody(AuditEventIngestSchema, request.body, reply);
        if (!data) {
          request.server.metrics.recordFailure('validation');
          return;
        }

        try {
          if (app.queues) {
            await app.queues.auditEvent.enqueue(data);
          } else {
            request.log.info({ event: 'audit_event_ingested', ...data }, 'audit_event_ingested');
          }
        } catch (err: unknown) {
          request.log.error({ err, traceId: data.traceId }, 'Failed to enqueue audit-event');
          request.server.metrics.recordFailure('provider');
          return reply.code(503).send({
            error: 'QueueUnavailable',
            message: 'Telemetry ingest is temporarily unavailable',
          });
        }

        return reply.code(202).send({
          traceId: data.traceId,
          sequenceNo: data.sequenceNo,
          acknowledged: true,
        });
      },
    );
  };
}
