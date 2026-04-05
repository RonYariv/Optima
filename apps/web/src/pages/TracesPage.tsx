import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import PaginationFooter from '../components/PaginationFooter'
import { usePagination } from '../lib/use-pagination'
import type { TraceStatus } from '../types'

const STATUSES: TraceStatus[] = ['running', 'success', 'failed', 'partial']

export default function TracesPage() {
  const [status, setStatus] = useState<TraceStatus | ''>('')
  const { cursor, history, nextPage, prevPage, reset } = usePagination()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['traces', status, cursor],
    queryFn: () => api.traces.list({ status: status || undefined, cursor }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-white">Traces</h1>
        <select
          className="text-sm rounded px-3 py-1.5 border"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TraceStatus | '')
            reset()
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)' }}>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Trace ID</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Agent</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Status</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Started</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Cost (USD)</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-muted)' }}>
                  Loading…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-400">
                  Failed to load traces
                </td>
              </tr>
            )}
            {data?.data.map((trace) => (
              <tr
                key={trace.id}
                className="border-t hover:bg-white/5 transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <td className="px-4 py-3 font-mono text-xs">
                  <Link to={`/traces/${trace.id}`} className="text-sky-400 hover:text-sky-300 hover:underline">
                    {trace.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{trace.agentId}</td>
                <td className="px-4 py-3"><StatusBadge status={trace.status} /></td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {new Date(trace.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {trace.totalCostUsd != null ? `$${Number(trace.totalCostUsd).toFixed(4)}` : '—'}
                </td>
              </tr>
            ))}
            {!isLoading && !isError && data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-muted)' }}>
                  No traces found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        hasPrev={history.length > 0}
        hasNext={!!data?.nextCursor}
        onPrev={prevPage}
        onNext={() => nextPage(data?.nextCursor)}
      />
    </div>
  )
}
