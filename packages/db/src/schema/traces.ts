import { pgEnum, pgTable, text, timestamp, jsonb, index, numeric, integer } from 'drizzle-orm/pg-core';

export const traceStatusEnum = pgEnum('trace_status', [
  'running',
  'success',
  'failed',
  'partial',
]);

export const traces = pgTable(
  'traces',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    agentId: text('agent_id').notNull(),
    status: traceStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    totalCostUsd: numeric('total_cost_usd', { precision: 14, scale: 8 }).default('0'),
    totalTokens: integer('total_tokens').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('traces_project_created_idx').on(t.projectId, t.createdAt),
  ],
);

export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
