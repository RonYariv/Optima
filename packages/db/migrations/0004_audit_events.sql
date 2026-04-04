CREATE TYPE "public"."audit_event_kind" AS ENUM('agent_start', 'agent_end', 'agent_handoff', 'model_call', 'tool_call', 'mcp_call', 'custom');--> statement-breakpoint
CREATE TABLE "audit_events" (
        "id" text PRIMARY KEY NOT NULL,
        "trace_id" text NOT NULL,
        "tenant_id" text NOT NULL,
        "sequence_no" integer NOT NULL,
        "kind" "audit_event_kind" NOT NULL,
        "actor_id" text,
        "name" text,
        "input" jsonb,
        "output" jsonb,
        "latency_ms" integer,
        "success" boolean,
        "error" jsonb,
        "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "occurred_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_trace_id_idx" ON "audit_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_created_idx" ON "audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_trace_seq_idx" ON "audit_events" USING btree ("trace_id","sequence_no");
