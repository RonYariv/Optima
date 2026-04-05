import type { DbClient } from '../client.js';
import { failureEvents } from '../schema/index.js';
import type { NewFailureEvent } from '../schema/index.js';

export class FailureEventRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewFailureEvent): Promise<boolean> {
    const rows = await this.db
      .insert(failureEvents)
      .values(data)
      .onConflictDoNothing({ target: failureEvents.id })
      .returning({ id: failureEvents.id });

    return rows.length > 0;
  }
}
