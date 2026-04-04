import type { FastifyInstance } from 'fastify';
import {
  ModelCallIngestSchema,
  ToolCallIngestSchema,
  type ModelCallIngest,
  type ToolCallIngest,
} from '@agent-optima/schemas';
import type { IProviderAdapter } from '../providers/index.js';

/**
 * Ingest routes — receive raw model/tool call telemetry from customer agents.
 *
 * These endpoints:
 *  1. Validate the incoming payload with Zod schemas.
 *  2. Forward the LLM call to the configured provider adapter.
 *  3. Emit a trace event for async processing (Phase 2: Kafka).
 *     For Phase 1 MVP we log the enriched event to stdout as a
 *     structured JSON line — the event pipeline will consume from here.
 *  4. Return the provider response to the caller immediately.
 */
export function buildIngestRoutes(adapter: IProviderAdapter) {
  return async function ingestRoutes(app: FastifyInstance): Promise<void> {

    // ── POST /v1/ingest/model-call ─────────────────────────────────────────
    app.post<{ Body: ModelCallIngest }>(
      '/v1/ingest/model-call',
      async (request, reply) => {
        // Parse + validate
        const parsed = ModelCallIngestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(422).send({
            error: 'UnprocessableEntity',
            message: 'Invalid payload',
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;

        // Guard: tenantId in body must match authenticated tenant
        if (data.tenantId !== request.tenantId) {
          return reply.code(403).send({ error: 'Forbidden', message: 'tenantId mismatch' });
        }

        // Forward to provider
        let providerResponse;
        try {
          providerResponse = await adapter.call({
            modelProvider: data.modelProvider,
            modelName: data.modelName,
            payload: { messages: [] }, // caller sends messages via metadata in real SDK
            maxTokens: 1024,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'provider error';
          request.log.error({ err, traceId: data.traceId }, 'Provider call failed');
          return reply.code(502).send({ error: 'ProviderError', message: msg });
        }

        // Emit enriched trace event (stdout structured log → Phase 2 Kafka consumer)
        request.log.info(
          {
            event: 'model_call_ingested',
            tenantId: data.tenantId,
            projectId: data.projectId,
            traceId: data.traceId,
            stepId: data.stepId,
            agentId: data.agentId,
            modelProvider: data.modelProvider,
            modelName: data.modelName,
            inputTokens: providerResponse.inputTokens,
            outputTokens: providerResponse.outputTokens,
            latencyMs: providerResponse.latencyMs,
            requestAt: data.requestAt,
            responseAt: data.responseAt,
          },
          'model_call_ingested',
        );

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

        // Tool calls don't hit an LLM provider — just emit the trace event
        request.log.info(
          {
            event: 'tool_call_ingested',
            tenantId: data.tenantId,
            projectId: data.projectId,
            traceId: data.traceId,
            stepId: data.stepId,
            agentId: data.agentId,
            toolName: data.toolName,
            success: data.success,
            latencyMs: data.latencyMs,
            errorType: data.errorType ?? null,
            requestAt: data.requestAt,
            responseAt: data.responseAt,
          },
          'tool_call_ingested',
        );

        return reply.code(200).send({
          traceId: data.traceId,
          stepId: data.stepId,
          acknowledged: true,
        });
      },
    );
  };
}
