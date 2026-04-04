CREATE TYPE "public"."trace_status" AS ENUM('running', 'success', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('model', 'tool');--> statement-breakpoint
CREATE TYPE "public"."model_provider" AS ENUM('openai', 'anthropic', 'azure-openai', 'other');--> statement-breakpoint
CREATE TYPE "public"."failure_category" AS ENUM('tool_error', 'provider_error', 'logic_break', 'handoff_error', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."failure_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"status" "trace_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"agent_id" text NOT NULL,
	"type" "step_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"step_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"model_provider" "model_provider" NOT NULL,
	"model_name" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"step_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"success" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	"error_type" text,
	"requested_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failure_events" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"step_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"severity" "failure_severity" NOT NULL,
	"category" "failure_category" NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_steps" ADD CONSTRAINT "trace_steps_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_steps" ADD CONSTRAINT "trace_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_step_id_trace_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."trace_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_step_id_trace_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."trace_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_step_id_trace_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."trace_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traces_tenant_created_idx" ON "traces" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "trace_steps_tenant_created_idx" ON "trace_steps" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_tenant_created_idx" ON "model_calls" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_calls_tenant_created_idx" ON "tool_calls" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "failure_events_tenant_created_idx" ON "failure_events" USING btree ("tenant_id","created_at");