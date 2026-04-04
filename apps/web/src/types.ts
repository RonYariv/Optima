export type TraceStatus = 'running' | 'success' | 'failed' | 'partial'
export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical'
export type CostGroupBy = 'day' | 'model' | 'agent'

export interface Trace {
  id: string
  projectId: string
  agentId: string
  status: TraceStatus
  startedAt: string
  endedAt?: string
  totalCostUsd?: number
  totalTokens?: number
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
  message: string
  occurredAt: string
}

export interface CostSummaryItem {
  groupKey: string
  totalCostUsd: number
  totalTokens?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor?: string
}

// React Flow graph shapes returned by /v1/traces/:id/graph
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
