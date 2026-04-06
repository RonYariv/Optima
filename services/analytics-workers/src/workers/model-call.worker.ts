import type { ModelCallIngest } from '@agent-optima/schemas';
import type { TraceRepository, ModelCallRepository, FailureEventRepository } from '@agent-optima/db';
import type { IPricingService } from '../pricing.js';
import { classifyRootCause } from '../root-cause-classifier.js';

/**
 * Handles a model-call ingest job:
 *  1. Upsert the parent trace
 *  2. Upsert the trace step
 *  3. Insert the model call (idempotent on step_id)
 *  4. Compute and store cost_usd
 *
 * All DB writes are idempotent — replaying the same job is safe.
 */
export class ModelCallWorker {
  constructor(
    private readonly traceRepo: TraceRepository,
    private readonly modelCallRepo: ModelCallRepository,
    private readonly failureRepo: FailureEventRepository,
    private readonly pricing: IPricingService,
  ) {}

  async handle(data: ModelCallIngest): Promise<void> {
    const now = new Date();

    // 1. Upsert trace (running state — will be updated by final step)
    await this.traceRepo.upsertTrace({
      id: data.traceId,
      projectId: data.projectId,
      agentId: data.agentId,
      status: 'running',
      startedAt: new Date(data.requestAt),
      metadata: data.metadata,
      createdAt: now,
    });

    // 2. Upsert trace step
    await this.traceRepo.upsertStep({
      id: data.stepId,
      traceId: data.traceId,
      stepIndex: data.stepIndex,
      agentId: data.agentId,
      type: 'model',
      startedAt: new Date(data.requestAt),
      endedAt: new Date(data.responseAt),
      metadata: data.metadata,
      createdAt: now,
    });

    // 3. Compute cost
    const costUsd = this.pricing.computeCostUsd({
      modelName: data.modelName,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
    });

    // 4. Insert model call (idempotent: onConflictDoNothing on id=stepId)
    const inserted = await this.modelCallRepo.insert({
      id: data.stepId,
      traceId: data.traceId,
      stepId: data.stepId,
      modelProvider: data.modelProvider,
      modelName: data.modelName,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      latencyMs: data.latencyMs,
      costUsd: costUsd.toFixed(8),
      requestedAt: new Date(data.requestAt),
      respondedAt: new Date(data.responseAt),
      createdAt: now,
    });

    // 5. Only update denormalised totals if this was a new insert (prevents double-counting on replay)
    if (inserted) {
      await this.traceRepo.incrementCost(
        data.traceId,
        costUsd.toFixed(8),
        data.inputTokens + data.outputTokens,
      );

      const metadataError =
        data.metadata && typeof data.metadata === 'object'
          ? (data.metadata['error'] as Record<string, unknown> | undefined)
          : undefined;
      const errorType =
        metadataError && typeof metadataError['type'] === 'string'
          ? metadataError['type']
          : null;
      const errorMessage =
        metadataError && typeof metadataError['message'] === 'string'
          ? metadataError['message']
          : null;

      // Model call failures are captured in metadata.error by the ingest bridge.
      if (errorType || errorMessage) {
        const rootCause = classifyRootCause(errorType, data.modelName);
        await this.failureRepo.insert({
          id: `${data.stepId}:failure:model`,
          traceId: data.traceId,
          stepId: data.stepId,
          severity: 'high',
          category: 'provider_error',
          reason:
            errorMessage ??
            `Model "${data.modelName}" failed${errorType ? `: ${errorType}` : ''}`,
          evidence: {
            modelProvider: data.modelProvider,
            modelName: data.modelName,
            errorType,
            errorMessage,
            metadata: data.metadata,
          },
          rootCause,
          occurredAt: new Date(data.responseAt),
          createdAt: now,
        });
      }
    }
  }
}
