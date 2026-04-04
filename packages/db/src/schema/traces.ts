import { pgEnum, pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

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
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    agentId: text('agent_id').notNull(),
    status: traceStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('traces_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('traces_tenant_project_idx').on(t.tenantId, t.projectId),
  ],
);

export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
