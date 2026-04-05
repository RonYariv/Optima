-- Add missing composite indexes for trace detail query O(1) performance
-- Resolves PERF-2: trace detail fetch requires (traceId, stepId) composite access

-- Model calls: query by (trace_id, step_id) for step enrichment
CREATE INDEX IF NOT EXISTS idx_model_calls_trace_step 
  ON model_calls(trace_id, step_id);

-- Tool calls: query by (trace_id, step_id) for step enrichment
CREATE INDEX IF NOT EXISTS idx_tool_calls_trace_step 
  ON tool_calls(trace_id, step_id);

-- Failure events: query by (trace_id, step_id) for step enrichment
CREATE INDEX IF NOT EXISTS idx_failure_events_trace_step 
  ON failure_events(trace_id, step_id);

-- Audit events: order by sequence_no for audit log
CREATE INDEX IF NOT EXISTS idx_audit_events_trace_sequence 
  ON audit_events(trace_id, sequence_no);

-- Trace steps: quick lookup by step_index within trace
CREATE INDEX IF NOT EXISTS idx_trace_steps_trace_index 
  ON trace_steps(trace_id, step_index);
