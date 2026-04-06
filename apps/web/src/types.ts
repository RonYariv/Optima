export type TraceStatus = 'running' | 'success' | 'failed' | 'partial'
export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical'
export type CostGroupBy = 'day' | 'model' | 'agent'
export type AuditEventKind =
  | 'agent_start'
  | 'agent_end'
  | 'agent_handoff'
  | 'model_call'
  | 'tool_call'
  | 'mcp_call'
  | 'custom'

export interface Trace {
  id: string
  projectId: string
  agentId: string
  status: TraceStatus
  startedAt: string
  endedAt?: string
  metadata?: Record<string, unknown>
  totalCostUsd?: number
  totalTokens?: number
}

export interface TraceDetail extends Trace {
  steps: TraceStep[]
  graph: TraceGraph
}

export interface TraceStep {
  id: string
  traceId: string
  type: 'model_call' | 'tool_call'
  startedAt: string
  endedAt?: string
  latencyMs?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  toolName?: string
  success?: boolean
  errorType?: string
}

export interface Failure {
  id: string
  traceId: string
  stepId?: string
  severity: FailureSeverity
  category: string
  reason: string  // DB column name — was incorrectly typed as `message` (SCHEMA-1)
  occurredAt: string
}

export interface CostBreakdownItem {
  key: string
  costUsd: number
  tokenCount: number
  callCount: number
}

export interface CostSummaryResponse {
  totalCostUsd: number
  totalTokens: number
  breakdown: CostBreakdownItem[]
}

export type StatsWindow = '1h' | '24h' | '7d'

export interface PerformanceRow {
  name: string
  callCount: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  avgMs: number
}

export interface ModelPerformanceRow extends PerformanceRow {
  totalTokens: number
}

export interface ToolPerformanceRow extends PerformanceRow {
  successRate: number
}

export interface McpPerformanceRow extends PerformanceRow {
  successRate: number
  errorCount: number
}

export interface PerformanceSummaryResponse {
  view: 'models' | 'tools' | 'mcps'
  paging: {
    limit: number
    offset: number
    hasMore: boolean
  }
  window: StatsWindow
  from: string
  to: string
  selectedMcp: string | null
  availableMcps: string[]
  models: ModelPerformanceRow[]
  tools: ToolPerformanceRow[]
  mcps: McpPerformanceRow[]
}

export interface StatsSummaryResponse {
  window: StatsWindow
  modelCall: {
    count: number
    p50Ms: number
    p95Ms: number
    p99Ms: number
  }
  toolCall: {
    count: number
    p50Ms: number
    p95Ms: number
    p99Ms: number
  }
  queue: {
    depth: number
    eventsPerSecond: number
    drainTimeSec: number | null
  }
  failures: {
    timeout: number
    auth: number
    validation: number
    provider: number
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor?: string
}

export interface AuditEvent {
  id: string
  traceId: string
  sequenceNo: number
  kind: AuditEventKind
  actorId?: string | null
  name?: string | null
  input?: Record<string, unknown> | null
  output?: Record<string, unknown> | null
  latencyMs?: number | null
  success?: boolean | null
  error?: { type?: string; message?: string } | null
  metadata: Record<string, unknown>
  occurredAt: string
  createdAt: string
}

// React Flow graph shapes returned by /v1/traces/:id
// Must extend Record<string,unknown> to satisfy @xyflow/react Node constraint
export interface RFNodeData extends Record<string, unknown> {
  label: string
  status?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  failureReason?: string
  toolName?: string
  success?: boolean
  errorType?: string
}

export interface RFNode {
  id: string
  type: 'agent' | 'model_call' | 'tool_call'
  position: { x: number; y: number }
  data: RFNodeData
}

export interface RFEdge {
  id: string
  source: string
  target: string
}

export interface TraceGraph {
  nodes: RFNode[]
  edges: RFEdge[]
}
