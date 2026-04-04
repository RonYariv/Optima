import { z } from 'zod';

const isoDateTime = z.string().datetime();

export const TenantIdSchema = z.string().min(3).max(128);
export const ProjectIdSchema = z.string().min(3).max(128);
export const AgentIdSchema = z.string().min(1).max(128);
export const TraceIdSchema = z.string().min(1).max(128);
export const StepIdSchema = z.string().min(1).max(128);

export const ModelCallIngestSchema = z.object({
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  traceId: TraceIdSchema,
  stepId: StepIdSchema,
  agentId: AgentIdSchema,
  modelProvider: z.enum(['openai', 'anthropic', 'azure-openai', 'other']),
  modelName: z.string().min(1).max(256),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  requestAt: isoDateTime,
  responseAt: isoDateTime,
  metadata: z.record(z.unknown()).default({})
});

export const ToolCallIngestSchema = z.object({
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  traceId: TraceIdSchema,
  stepId: StepIdSchema,
  agentId: AgentIdSchema,
  toolName: z.string().min(1).max(256),
  success: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  errorType: z.string().max(128).optional(),
  requestAt: isoDateTime,
  responseAt: isoDateTime,
  metadata: z.record(z.unknown()).default({})
});

// CostEventSchema and FailureEventSchema are reserved for a future direct-ingest
// endpoint. They are not consumed by any service today — do not remove.
export const CostEventSchema = z.object({
  tenantId: TenantIdSchema,
  traceId: TraceIdSchema,
  stepId: StepIdSchema,
  modelProvider: z.string().min(1).max(64),
  modelName: z.string().min(1).max(256),
  currency: z.literal('USD').default('USD'),
  estimatedCost: z.number().nonnegative(),
  occurredAt: isoDateTime
});

export const FailureEventSchema = z.object({
  tenantId: TenantIdSchema,
  traceId: TraceIdSchema,
  stepId: StepIdSchema,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.enum(['tool_error', 'provider_error', 'logic_break', 'handoff_error', 'unknown']),
  reason: z.string().min(1),
  evidence: z.record(z.unknown()).default({}),
  occurredAt: isoDateTime
});

export type ModelCallIngest = z.infer<typeof ModelCallIngestSchema>;
export type ToolCallIngest = z.infer<typeof ToolCallIngestSchema>;
export type CostEvent = z.infer<typeof CostEventSchema>;
export type FailureEvent = z.infer<typeof FailureEventSchema>;
