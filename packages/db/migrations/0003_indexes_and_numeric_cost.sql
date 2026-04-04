-- Add missing indexes on foreign-key trace_id columns (PERF-2)
CREATE INDEX IF NOT EXISTS "trace_steps_trace_id_idx" ON "trace_steps" ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_calls_trace_id_idx" ON "model_calls" ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_calls_trace_id_idx" ON "tool_calls" ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "failure_events_trace_id_idx" ON "failure_events" ("trace_id");--> statement-breakpoint
-- Composite index for projectId filter on the traces list endpoint
CREATE INDEX IF NOT EXISTS "traces_tenant_project_idx" ON "traces" ("tenant_id", "project_id");--> statement-breakpoint
-- Change cost_usd from float4 (real) to numeric to eliminate floating-point rounding errors (PERF-4)
ALTER TABLE "model_calls" ALTER COLUMN "cost_usd" TYPE numeric(14, 8) USING "cost_usd"::numeric(14, 8);--> statement-breakpoint
ALTER TABLE "model_calls" ALTER COLUMN "cost_usd" SET DEFAULT 0;
