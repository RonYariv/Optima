import type { AuditEventIngest } from '@agent-optima/schemas';
import type { AuditEventRepository } from '@agent-optima/db';
import { randomUUID } from 'crypto';

/**
 * Handles an audit-event ingest job:
 *  Inserts the audit event row (idempotent on id).
 *
 * The id is derived from traceId + sequenceNo so replaying the same job is safe.
 */
export class AuditEventWorker {
  constructor(private readonly auditEventRepo: AuditEventRepository) {}

  async handle(data: AuditEventIngest): Promise<void> {
    const id = `${data.traceId}:${data.sequenceNo}`;

    await this.auditEventRepo.insert({
      id,
      traceId: data.traceId,
      tenantId: data.tenantId,
      sequenceNo: data.sequenceNo,
      kind: data.kind,
      actorId: data.actorId ?? null,
      name: data.name ?? null,
      input: data.input ?? null,
      output: data.output ?? null,
      latencyMs: data.latencyMs ?? null,
      success: data.success ?? null,
      error: data.error ?? null,
      metadata: data.metadata,
      occurredAt: new Date(data.occurredAt),
      createdAt: new Date(),
    });
  }
}
