CREATE INDEX IF NOT EXISTS "traces_project_status_created_idx"
ON "traces" ("project_id", "status", "created_at");

DROP INDEX IF EXISTS "audit_events_step_id_idx";
