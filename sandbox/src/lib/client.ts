import { OptimaClient, type AuditEventPayload, type ModelProvider } from '@agent-optima/sdk-node';
import { randomUUID } from 'crypto';

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
      const now = new Date().toISOString();

      const auditPromise = client.ingest.auditEvent({
        tenantId,
        projectId,
        traceId,
        agentId,
        sequenceNo: nextSeq(traceId),
        kind,
        occurredAt: now,
        metadata: {},
        ...fields,
      });

      // Also fire a model-call ingest so the analytics worker computes cost
      if (kind === 'model_call') {
        const meta = (fields.metadata ?? {}) as Record<string, unknown>;
        const inputTokens  = typeof meta['inputTokens']  === 'number' ? meta['inputTokens']  : 0;
        const outputTokens = typeof meta['outputTokens'] === 'number' ? meta['outputTokens'] : 0;
        const modelName    = fields.name ?? (typeof meta['model'] === 'string' ? meta['model'] : 'unknown');
        const latencyMs    = typeof fields.latencyMs === 'number' ? fields.latencyMs : 0;

        await Promise.all([
          auditPromise,
          client.ingest.modelCall({
            tenantId,
            projectId,
            traceId,
            stepId: randomUUID(),
            agentId,
            modelProvider: 'other' as ModelProvider,
            modelName,
            inputTokens,
            outputTokens,
            latencyMs,
            requestAt: now,
            responseAt: now,
            metadata: meta,
          }),
        ]);
      } else {
        await auditPromise;
      }
    },
  };
}
