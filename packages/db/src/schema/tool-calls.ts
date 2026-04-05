import { pgTable, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { traces } from './traces.js';
import { traceSteps } from './trace-steps.js';

export const toolCalls = pgTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => traces.id),
    stepId: text('step_id')
      .notNull()
      .references(() => traceSteps.id),
    toolName: text('tool_name').notNull(),
    success: boolean('success').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    errorType: text('error_type'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tool_calls_trace_id_idx').on(t.traceId),
  ],
);

export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
