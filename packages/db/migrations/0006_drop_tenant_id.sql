-- Drop tenant_id indexes
DROP INDEX IF EXISTS traces_tenant_created_idx;
DROP INDEX IF EXISTS traces_tenant_project_idx;
DROP INDEX IF EXISTS trace_steps_tenant_created_idx;
DROP INDEX IF EXISTS model_calls_tenant_created_idx;
DROP INDEX IF EXISTS model_calls_tenant_model_idx;
DROP INDEX IF EXISTS tool_calls_tenant_created_idx;
DROP INDEX IF EXISTS failure_events_tenant_created_idx;
DROP INDEX IF EXISTS audit_events_tenant_created_idx;

-- Drop tenant_id columns
ALTER TABLE traces DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE trace_steps DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE model_calls DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE tool_calls DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE failure_events DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE audit_events DROP COLUMN IF EXISTS tenant_id;

-- Add replacement indexes
CREATE INDEX IF NOT EXISTS traces_project_created_idx ON traces (project_id, created_at);
CREATE INDEX IF NOT EXISTS model_calls_model_name_idx ON model_calls (model_name);
