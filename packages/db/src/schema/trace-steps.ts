import { pgEnum, pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { traces } from './traces.js';

export const stepTypeEnum = pgEnum('step_type', ['model', 'tool']);

export const traceSteps = pgTable(
  'trace_steps',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => traces.id),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    stepIndex: integer('step_index').notNull(),
    agentId: text('agent_id').notNull(),
    type: stepTypeEnum('type').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('trace_steps_tenant_created_idx').on(t.tenantId, t.createdAt)],
);

export type TraceStep = typeof traceSteps.$inferSelect;
export type NewTraceStep = typeof traceSteps.$inferInsert;
