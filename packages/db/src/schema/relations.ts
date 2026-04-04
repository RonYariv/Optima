import { relations } from 'drizzle-orm';
import { traces } from './traces.js';
import { traceSteps } from './trace-steps.js';
import { modelCalls } from './model-calls.js';
import { toolCalls } from './tool-calls.js';
import { failureEvents } from './failure-events.js';
import { tenants } from './tenants.js';

export const tenantsRelations = relations(tenants, ({ many }) => ({
  traces: many(traces),
}));

export const tracesRelations = relations(traces, ({ many }) => ({
  steps: many(traceSteps),
}));

export const traceStepsRelations = relations(traceSteps, ({ one, many }) => ({
  trace: one(traces, { fields: [traceSteps.traceId], references: [traces.id] }),
  modelCalls: many(modelCalls),
  toolCalls: many(toolCalls),
  failureEvents: many(failureEvents),
}));

export const modelCallsRelations = relations(modelCalls, ({ one }) => ({
  step: one(traceSteps, { fields: [modelCalls.stepId], references: [traceSteps.id] }),
  trace: one(traces, { fields: [modelCalls.traceId], references: [traces.id] }),
}));

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
  step: one(traceSteps, { fields: [toolCalls.stepId], references: [traceSteps.id] }),
  trace: one(traces, { fields: [toolCalls.traceId], references: [traces.id] }),
}));

export const failureEventsRelations = relations(failureEvents, ({ one }) => ({
  step: one(traceSteps, { fields: [failureEvents.stepId], references: [traceSteps.id] }),
  trace: one(traces, { fields: [failureEvents.traceId], references: [traces.id] }),
}));
