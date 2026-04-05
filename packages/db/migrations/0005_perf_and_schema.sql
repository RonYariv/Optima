-- Migration 0005: performance indexes, trace cost totals, audit_events step_id
-- PERF-5: denormalised cost/token totals on traces for O(1) list endpoint reads
ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "total_cost_usd" numeric(14, 8) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "total_tokens" integer DEFAULT 0;--> statement-breakpoint
-- PERF-2: index for groupBy=model cost aggregation
CREATE INDEX IF NOT EXISTS "model_calls_tenant_model_idx" ON "model_calls" USING btree ("tenant_id","model_name");--> statement-breakpoint
-- SCHEMA-5: optional step_id on audit_events for step-level event correlation
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "step_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT IF NOT EXISTS "audit_events_step_id_trace_steps_id_fk"
  FOREIGN KEY ("step_id") REFERENCES "public"."trace_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_step_id_idx" ON "audit_events" USING btree ("step_id");
