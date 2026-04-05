import type { DbClient } from '../client.js';
import { auditEvents } from '../schema/index.js';
import type { NewAuditEvent } from '../schema/index.js';

export class AuditEventRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewAuditEvent): Promise<boolean> {
    const rows = await this.db
      .insert(auditEvents)
      .values(data)
      .onConflictDoNothing({ target: auditEvents.id })
      .returning({ id: auditEvents.id });

    return rows.length > 0;
  }
}
