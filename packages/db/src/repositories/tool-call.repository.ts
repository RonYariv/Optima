import type { DbClient } from '../client.js';
import { toolCalls } from '../schema/index.js';
import type { NewToolCall } from '../schema/index.js';

export class ToolCallRepository {
  constructor(private readonly db: DbClient) {}

  async insert(data: NewToolCall): Promise<void> {
    await this.db
      .insert(toolCalls)
      .values(data)
      .onConflictDoNothing({ target: toolCalls.id });
  }
}
