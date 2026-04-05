import { eq, and, sql } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { traces, traceSteps } from '../schema/index.js';
import type { NewTrace, NewTraceStep } from '../schema/index.js';

/**
 * TraceRepository — owns all reads/writes for traces and trace_steps.
 *
 * All methods are tenant-scoped: every query includes tenantId to prevent
 * cross-tenant data access at the repository layer.
 */
export class TraceRepository {
  constructor(private readonly db: DbClient) {}

  async upsertTrace(data: NewTrace): Promise<void> {
    await this.db
      .insert(traces)
      .values(data)
      .onConflictDoUpdate({
        target: traces.id,
        set: {
          status: data.status,
          endedAt: data.endedAt,
          metadata: data.metadata,
        },
      });
  }

  async upsertStep(data: NewTraceStep): Promise<void> {
    await this.db
      .insert(traceSteps)
      .values(data)
      .onConflictDoUpdate({
        target: traceSteps.id,
        set: {
          endedAt: data.endedAt,
          metadata: data.metadata,
        },
      });
  }

  /** Atomically add cost and token counts to a trace's running totals (PERF-5). */
  async incrementCost(traceId: string, costUsd: string, tokens: number): Promise<void> {
    await this.db
      .update(traces)
      .set({
        totalCostUsd: sql`COALESCE(total_cost_usd, 0) + ${costUsd}::numeric`,
        totalTokens: sql`COALESCE(total_tokens, 0) + ${tokens}`,
      })
      .where(eq(traces.id, traceId));
  }

  /** @internal Used only in integration tests — routes use fetchTraceWithSteps directly. */
  async findById(tenantId: string, traceId: string) {
    return this.db.query.traces.findFirst({
      where: and(eq(traces.id, traceId), eq(traces.tenantId, tenantId)),
      with: { steps: true },
    });
  }

  /** @internal Used only in integration tests. */
  async findStepById(tenantId: string, stepId: string) {
    return this.db.query.traceSteps.findFirst({
      where: and(eq(traceSteps.id, stepId), eq(traceSteps.tenantId, tenantId)),
    });
  }
}
