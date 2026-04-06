import type {
  PaginatedResponse,
  Trace,
  TraceDetail,
  Failure,
  CostSummaryResponse,
  StatsSummaryResponse,
  PerformanceSummaryResponse,
  StatsWindow,
  TraceStatus,
  FailureSeverity,
  CostGroupBy,
  AuditEvent,
} from '../types'
import { tokenStore } from './token-store'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'

function authHeaders(): HeadersInit {
  const token = tokenStore.get()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export interface TraceListParams {
  projectId?: string
  status?: TraceStatus
  from?: string
  to?: string
  cursor?: string
}

export interface FailureListParams {
  severity?: FailureSeverity
  category?: string
  from?: string
  to?: string
  cursor?: string
}

export interface CostSummaryParams {
  groupBy?: CostGroupBy
  from?: string
  to?: string
}

export interface PerformanceParams {
  view?: 'models' | 'tools' | 'mcps'
  window?: StatsWindow
  mcpName?: string
  q?: string
  limit?: number
  offset?: number
  direction?: 'asc' | 'desc'
  sortBy?: 'name' | 'callCount' | 'avgMs' | 'p95Ms' | 'p99Ms' | 'successRate' | 'errorCount' | 'totalTokens'
}

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null) q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  traces: {
    list: (params?: TraceListParams) =>
      request<PaginatedResponse<Trace>>(`/v1/traces${buildQuery({ ...params })}`),

    get: (traceId: string) =>
      request<TraceDetail>(`/v1/traces/${traceId}`),

    auditLog: (traceId: string) =>
      request<{ data: AuditEvent[] }>(`/v1/traces/${traceId}/audit-log`),
  },

  failures: {
    list: (params?: FailureListParams) =>
      request<PaginatedResponse<Failure>>(`/v1/failures${buildQuery({ ...params })}`),
  },

  cost: {
    summary: (params?: CostSummaryParams) =>
      request<CostSummaryResponse>(`/v1/cost/summary${buildQuery({ ...params })}`),
  },

  stats: {
    summary: (window: StatsWindow = '1h') =>
      request<StatsSummaryResponse>(`/v1/stats${buildQuery({ window })}`),
  },

  performance: {
    summary: (params?: PerformanceParams) =>
      request<PerformanceSummaryResponse>(`/v1/performance${buildQuery({
        view: params?.view,
        window: params?.window,
        mcpName: params?.mcpName,
        q: params?.q,
        limit: params?.limit != null ? String(params.limit) : undefined,
        offset: params?.offset != null ? String(params.offset) : undefined,
        direction: params?.direction,
        sortBy: params?.sortBy,
      })}`),
  },
}
