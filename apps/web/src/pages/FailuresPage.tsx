import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import SeverityBadge from '../components/SeverityBadge'
import PaginationFooter from '../components/PaginationFooter'
import { usePagination } from '../lib/use-pagination'
import type { FailureSeverity } from '../types'

const SEVERITIES: FailureSeverity[] = ['low', 'medium', 'high', 'critical']

export default function FailuresPage() {
  const [severity, setSeverity] = useState<FailureSeverity | ''>('')
  const { cursor, history, nextPage, prevPage, reset } = usePagination()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['failures', severity, cursor],
    queryFn: () => api.failures.list({ severity: severity || undefined, cursor }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-white">Failures</h1>
        <select
          className="text-sm rounded px-3 py-1.5 border"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value as FailureSeverity | '')
            reset()
          }}
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
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
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Severity</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Category</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Message</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Trace ID</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Occurred</th>
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
                  Failed to load failures
                </td>
              </tr>
            )}
            {data?.data.map((failure) => (
              <tr
                key={failure.id}
                className="border-t hover:bg-white/5 transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <td className="px-4 py-3"><SeverityBadge severity={failure.severity} /></td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{failure.category}</td>
                <td className="px-4 py-3 max-w-xs truncate" style={{ color: 'var(--color-muted)' }}>
                  {failure.reason}
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-muted)' }}>
                  <Link
                    to={`/traces/${failure.traceId}`}
                    className="hover:text-sky-400 transition-colors"
                  >
                    {failure.traceId.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {new Date(failure.occurredAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!isLoading && !isError && data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-muted)' }}>
                  No failures found
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
