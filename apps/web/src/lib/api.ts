import type {
  PaginatedResponse,
  Trace,
  TraceGraph,
  Failure,
  CostSummaryResponse,
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
      request<Trace>(`/v1/traces/${traceId}`),

    graph: (traceId: string) =>
      request<TraceGraph>(`/v1/traces/${traceId}/graph`),

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
}
