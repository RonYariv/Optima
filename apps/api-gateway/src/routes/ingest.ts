import type { FastifyInstance } from 'fastify';
import {
  ModelCallIngestSchema,
  ToolCallIngestSchema,
  AuditEventIngestSchema,
  type ModelCallIngest,
  type ToolCallIngest,
  type AuditEventIngest,
} from '@agent-optima/schemas';
import type { IProviderAdapter } from '../providers/index.js';

/**
 * Ingest routes — receive raw model/tool call telemetry from customer agents.
 *
 * Flow:
 *  1. Validate payload (Zod)
 *  2. Forward LLM call to provider adapter (zero blocking on analytics)
 *  3. Enqueue job for async processing by analytics-workers
 *  4. Respond immediately — the caller never waits for DB writes
 *
 * If the queue is unavailable (DATABASE_URL not set / mock mode),
 * events are emitted as structured pino logs only — no data loss for dev.
 */
export function buildIngestRoutes(adapter: IProviderAdapter) {
  return async function ingestRoutes(app: FastifyInstance): Promise<void> {

    app.post<{ Body: ModelCallIngest }>(
      '/v1/ingest/model-call',
      async (request, reply) => {
        const parsed = ModelCallIngestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(422).send({
            error: 'UnprocessableEntity',
            message: 'Invalid payload',
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;

        if (data.tenantId !== request.tenantId) {
          return reply.code(403).send({ error: 'Forbidden', message: 'tenantId mismatch' });
        }

        // Forward to provider
        let providerResponse;
        try {
          providerResponse = await adapter.call({
            modelProvider: data.modelProvider,
            modelName: data.modelName,
            payload: { messages: [] },
            maxTokens: 1024,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'provider error';
          request.log.error({ err, traceId: data.traceId }, 'Provider call failed');
          return reply.code(502).send({ error: 'ProviderError', message: msg });
        }

        // Enrich payload with actual token counts from provider response
        const enriched: ModelCallIngest = {
          ...data,
          inputTokens: providerResponse.inputTokens,
          outputTokens: providerResponse.outputTokens,
          latencyMs: providerResponse.latencyMs,
        };

        // Fire-and-forget enqueue — never block the response on this
        if (app.queues) {
          app.queues.modelCall.enqueue(enriched).catch((err: unknown) => {
            request.log.error({ err, traceId: data.traceId }, 'Failed to enqueue model-call');
          });
        } else {
          request.log.info({ event: 'model_call_ingested', ...enriched }, 'model_call_ingested');
        }

        return reply.code(200).send({
          traceId: data.traceId,
          stepId: data.stepId,
          inputTokens: providerResponse.inputTokens,
          outputTokens: providerResponse.outputTokens,
          latencyMs: providerResponse.latencyMs,
          providerBody: providerResponse.body,
        });
      },
    );

    // ── POST /v1/ingest/tool-call ──────────────────────────────────────────
    app.post<{ Body: ToolCallIngest }>(
      '/v1/ingest/tool-call',
      async (request, reply) => {
        const parsed = ToolCallIngestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(422).send({
            error: 'UnprocessableEntity',
            message: 'Invalid payload',
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;

        if (data.tenantId !== request.tenantId) {
          return reply.code(403).send({ error: 'Forbidden', message: 'tenantId mismatch' });
        }

        if (app.queues) {
          app.queues.toolCall.enqueue(data).catch((err: unknown) => {
            request.log.error({ err, traceId: data.traceId }, 'Failed to enqueue tool-call');
          });
        } else {
          request.log.info({ event: 'tool_call_ingested', ...data }, 'tool_call_ingested');
        }

        return reply.code(200).send({
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
        const parsed = AuditEventIngestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(422).send({
            error: 'UnprocessableEntity',
            message: 'Invalid payload',
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;

        if (data.tenantId !== request.tenantId) {
          return reply.code(403).send({ error: 'Forbidden', message: 'tenantId mismatch' });
        }

        if (app.queues) {
          app.queues.auditEvent.enqueue(data).catch((err: unknown) => {
            request.log.error({ err, traceId: data.traceId }, 'Failed to enqueue audit-event');
          });
        } else {
          request.log.info({ event: 'audit_event_ingested', ...data }, 'audit_event_ingested');
        }

        return reply.code(200).send({
          traceId: data.traceId,
          sequenceNo: data.sequenceNo,
          acknowledged: true,
        });
      },
    );
  };
}
