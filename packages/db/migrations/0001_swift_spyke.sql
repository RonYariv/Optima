ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "tenants" CASCADE;--> statement-breakpoint
ALTER TABLE "traces" DROP CONSTRAINT IF EXISTS "traces_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "trace_steps" DROP CONSTRAINT IF EXISTS "trace_steps_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "model_calls" DROP CONSTRAINT IF EXISTS "model_calls_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_calls" DROP CONSTRAINT IF EXISTS "tool_calls_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "failure_events" DROP CONSTRAINT IF EXISTS "failure_events_tenant_id_tenants_id_fk";
