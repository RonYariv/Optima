import { pgEnum, pgTable, text, timestamp, integer, numeric, index } from 'drizzle-orm/pg-core';
import { traces } from './traces.js';
import { traceSteps } from './trace-steps.js';

export const modelProviderEnum = pgEnum('model_provider', [
  'openai',
  'anthropic',
  'azure-openai',
  'other',
]);

export const modelCalls = pgTable(
  'model_calls',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => traces.id),
    stepId: text('step_id')
      .notNull()
      .references(() => traceSteps.id),
    tenantId: text('tenant_id').notNull(),
    modelProvider: modelProviderEnum('model_provider').notNull(),
    modelName: text('model_name').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    costUsd: numeric('cost_usd', { precision: 14, scale: 8 }).notNull().default('0'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('model_calls_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('model_calls_trace_id_idx').on(t.traceId),
  ],
);

export type ModelCall = typeof modelCalls.$inferSelect;
export type NewModelCall = typeof modelCalls.$inferInsert;
