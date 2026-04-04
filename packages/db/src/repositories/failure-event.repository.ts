import type { DbClient } from '../client.js';
import { failureEvents } from '../schema/index.js';
import type { NewFailureEvent } from '../schema/index.js';

export class FailureEventRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewFailureEvent): Promise<void> {
    await this.db
      .insert(failureEvents)
      .values(data)
      .onConflictDoNothing({ target: failureEvents.id });
  }
}
