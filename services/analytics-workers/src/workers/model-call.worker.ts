import type { ModelCallIngest } from '@agent-optima/schemas';
import type { TraceRepository, ModelCallRepository } from '@agent-optima/db';
import type { IPricingService } from '../pricing.js';

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
    private readonly pricing: IPricingService,
  ) {}

  async handle(data: ModelCallIngest): Promise<void> {
    const now = new Date();

    // 1. Upsert trace (running state — will be updated by final step)
    await this.traceRepo.upsertTrace({
      id: data.traceId,
      tenantId: data.tenantId,
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
      tenantId: data.tenantId,
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
    await this.modelCallRepo.insert({
      id: data.stepId,
      traceId: data.traceId,
      stepId: data.stepId,
      tenantId: data.tenantId,
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

    // 5. Update denormalised trace totals for O(1) trace list reads (PERF-5)
    await this.traceRepo.incrementCost(
      data.traceId,
      costUsd.toFixed(8),
      data.inputTokens + data.outputTokens,
    );
  }
}
