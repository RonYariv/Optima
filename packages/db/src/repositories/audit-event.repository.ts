import { eq, asc } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { auditEvents } from '../schema/index.js';
import type { NewAuditEvent, AuditEvent } from '../schema/index.js';

export class AuditEventRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewAuditEvent): Promise<void> {
    await this.db
      .insert(auditEvents)
      .values(data)
      .onConflictDoNothing({ target: auditEvents.id });
  }

  async findByTrace(traceId: string): Promise<AuditEvent[]> {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.traceId, traceId))
      .orderBy(asc(auditEvents.sequenceNo));
  }
}
