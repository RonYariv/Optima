import type { DbClient } from '../client.js';
import { toolCalls } from '../schema/index.js';
import type { NewToolCall } from '../schema/index.js';

export class ToolCallRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewToolCall): Promise<boolean> {
    const rows = await this.db
      .insert(toolCalls)
      .values(data)
      .onConflictDoNothing({ target: toolCalls.id })
      .returning({ id: toolCalls.id });

    return rows.length > 0;
  }
}
