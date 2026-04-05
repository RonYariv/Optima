import { OptimaClient, type AuditEventPayload } from '@agent-optima/sdk-node';

// Sequence counter map — keyed by traceId
const seqMap = new Map<string, number>();

function nextSeq(traceId: string): number {
  const n = (seqMap.get(traceId) ?? -1) + 1;
  seqMap.set(traceId, n);
  return n;
}

export type EventFields = Omit<AuditEventPayload, 'tenantId' | 'projectId' | 'traceId' | 'agentId' | 'sequenceNo' | 'occurredAt'>;

export interface SandboxTracer {
  event(kind: AuditEventPayload['kind'], fields?: EventFields): Promise<void>;
  traceId: string;
}

export function createSandboxTracer(
  client: OptimaClient,
  tenantId: string,
  projectId: string,
  traceId: string,
  agentId: string,
): SandboxTracer {
  return {
    traceId,
    async event(kind, fields = {}) {
      await client.ingest.auditEvent({
        tenantId,
        projectId,
        traceId,
        agentId,
        sequenceNo: nextSeq(traceId),
        kind,
        occurredAt: new Date().toISOString(),
        metadata: {},
        ...fields,
      });
    },
  };
}
