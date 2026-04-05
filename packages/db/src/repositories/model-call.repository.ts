import type { DbClient } from '../client.js';
import { modelCalls } from '../schema/index.js';
import type { NewModelCall } from '../schema/index.js';

export class ModelCallRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewModelCall): Promise<boolean> {
    const rows = await this.db
      .insert(modelCalls)
      .values(data)
      .onConflictDoNothing({ target: modelCalls.id })
      .returning({ id: modelCalls.id });

    return rows.length > 0;
  }
}
