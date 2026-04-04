import { pgEnum, pgTable, text, timestamp, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { traces } from './traces.js';

export const auditEventKindEnum = pgEnum('audit_event_kind', [
  'agent_start',
  'agent_end',
  'agent_handoff',
  'model_call',
  'tool_call',
  'mcp_call',
  'custom',
]);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => traces.id),
    tenantId: text('tenant_id').notNull(),
    sequenceNo: integer('sequence_no').notNull(),
    kind: auditEventKindEnum('kind').notNull(),
    actorId: text('actor_id'),
    name: text('name'),
    input: jsonb('input'),
    output: jsonb('output'),
    latencyMs: integer('latency_ms'),
    success: boolean('success'),
    error: jsonb('error'),
    metadata: jsonb('metadata').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_trace_id_idx').on(t.traceId),
    index('audit_events_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('audit_events_trace_seq_idx').on(t.traceId, t.sequenceNo),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
