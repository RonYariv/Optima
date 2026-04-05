import { pgEnum, pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { traces } from './traces.js';
import { traceSteps } from './trace-steps.js';

export const failureSeverityEnum = pgEnum('failure_severity', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const failureCategoryEnum = pgEnum('failure_category', [
  'tool_error',
  'provider_error',
  'logic_break',
  'handoff_error',
  'unknown',
]);

export const failureEvents = pgTable(
  'failure_events',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => traces.id),
    stepId: text('step_id')
      .notNull()
      .references(() => traceSteps.id),
    severity: failureSeverityEnum('severity').notNull(),
    category: failureCategoryEnum('category').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    rootCause: text('root_cause'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('failure_events_trace_id_idx').on(t.traceId),
  ],
);

export type FailureEvent = typeof failureEvents.$inferSelect;
export type NewFailureEvent = typeof failureEvents.$inferInsert;
