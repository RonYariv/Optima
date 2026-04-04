import type { ToolCallIngest } from '@agent-optima/schemas';
import type { TraceRepository, ToolCallRepository, FailureEventRepository } from '@agent-optima/db';

/**
 * Handles a tool-call ingest job:
 *  1. Upsert the parent trace
 *  2. Upsert the trace step
 *  3. Insert the tool call (idempotent on step_id)
 *  4. If success=false, create a failure_event automatically
 */
export class ToolCallWorker {
  constructor(
    private readonly traceRepo: TraceRepository,
    private readonly toolCallRepo: ToolCallRepository,
    private readonly failureRepo: FailureEventRepository,
  ) {}

  async handle(data: ToolCallIngest): Promise<void> {
    const now = new Date();

    // 1. Upsert trace
    await this.traceRepo.upsertTrace({
      id: data.traceId,
      tenantId: data.tenantId,
      projectId: data.projectId,
      agentId: data.agentId,
      status: data.success ? 'running' : 'failed',
      startedAt: new Date(data.requestAt),
      metadata: data.metadata,
      createdAt: now,
    });

    // 2. Upsert trace step
    await this.traceRepo.upsertStep({
      id: data.stepId,
      traceId: data.traceId,
      tenantId: data.tenantId,
      stepIndex: 0,
      agentId: data.agentId,
      type: 'tool',
      startedAt: new Date(data.requestAt),
      endedAt: new Date(data.responseAt),
      metadata: data.metadata,
      createdAt: now,
    });

    // 3. Insert tool call (idempotent)
    await this.toolCallRepo.insert({
      id: data.stepId,
      traceId: data.traceId,
      stepId: data.stepId,
      tenantId: data.tenantId,
      toolName: data.toolName,
      success: data.success,
      latencyMs: data.latencyMs,
      errorType: data.errorType ?? null,
      requestedAt: new Date(data.requestAt),
      respondedAt: new Date(data.responseAt),
      createdAt: now,
    });

    // 4. Auto-generate failure event on tool error
    if (!data.success) {
      await this.failureRepo.insert({
        id: `${data.stepId}:failure`,
        traceId: data.traceId,
        stepId: data.stepId,
        tenantId: data.tenantId,
        severity: 'medium',
        category: 'tool_error',
        reason: `Tool "${data.toolName}" failed${data.errorType ? `: ${data.errorType}` : ''}`,
        evidence: {
          toolName: data.toolName,
          errorType: data.errorType ?? null,
          metadata: data.metadata,
        },
        occurredAt: new Date(data.responseAt),
        createdAt: now,
      });
    }
  }
}
