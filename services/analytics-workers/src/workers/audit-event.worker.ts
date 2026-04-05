import type { AuditEventIngest } from '@agent-optima/schemas';
import type { AuditEventRepository, TraceRepository } from '@agent-optima/db';

/**
 * Handles an audit-event ingest job:
 *  1. Upsert the parent trace (so FK constraint is satisfied)
 *  2. Inserts the audit event row (idempotent on id).
 *
 * The id is derived from traceId + sequenceNo so replaying the same job is safe.
 */
export class AuditEventWorker {
  constructor(
    private readonly auditEventRepo: AuditEventRepository,
    private readonly traceRepo: TraceRepository,
  ) {}

  async handle(data: AuditEventIngest): Promise<void> {
    const now = new Date();

    // 1. Upsert trace so the FK is satisfied regardless of message order.
    //    On agent_end, finalize the trace status based on the success field.
    const isEnd = data.kind === 'agent_end';
    const status = isEnd
      ? (data.success === false ? 'failed' : 'success')
      : 'running';

    await this.traceRepo.upsertTrace({
      id: data.traceId,
      projectId: data.projectId,
      agentId: data.agentId,
      status,
      startedAt: new Date(data.occurredAt),
      endedAt: isEnd ? new Date(data.occurredAt) : undefined,
      metadata: data.metadata,
      createdAt: now,
    });

    const id = `${data.traceId}:${data.sequenceNo}`;

    const inserted = await this.auditEventRepo.insert({
      id,
      traceId: data.traceId,
      sequenceNo: data.sequenceNo,
      kind: data.kind,
      actorId: data.actorId ?? null,
      name: data.name ?? null,
      input: data.input ?? null,
      output: data.output ?? null,
      latencyMs: data.latencyMs ?? null,
      success: data.success ?? null,
      error: data.error ?? null,
      stepId: data.stepId ?? null,
      metadata: data.metadata,
      occurredAt: new Date(data.occurredAt),
      createdAt: new Date(),
    });

    // Only increment telemetry counters if this was a new insert (prevents double-counting on replay)
    if (inserted) {
      // Note: caller tracks audit event count via this handler's return value or external counter
    }
  }
}
