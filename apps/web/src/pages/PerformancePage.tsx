import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  McpPerformanceRow,
  ModelPerformanceRow,
  StatsWindow,
  ToolPerformanceRow,
} from '../types'

const WINDOWS: StatsWindow[] = ['1h', '24h', '7d']
const VIEWS = ['models', 'tools', 'mcps'] as const
type PerfView = (typeof VIEWS)[number]

function TableHeader({ title }: { title: string }) {
  return <th className="px-4 py-3 font-medium text-left" style={{ color: 'var(--color-muted)' }}>{title}</th>
}

function SectionCard({ title, subtitle, value, accent }: { title: string; subtitle: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl border p-4 relative overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <div className="absolute inset-0 opacity-25" style={{ background: accent }} />
      <div className="relative">
        <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>{title}</div>
        <div className="text-2xl font-semibold text-white mt-1">{value}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{subtitle}</div>
      </div>
    </div>
  )
}

function DataTable({
  view,
  models,
  tools,
  mcps,
}: {
  view: PerfView
  models: ModelPerformanceRow[]
  tools: ToolPerformanceRow[]
  mcps: McpPerformanceRow[]
}) {
  const emptyRow = (
    <tr>
      <td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--color-muted)' }}>
        No data found for selected filters
      </td>
    </tr>
  )

  if (view === 'models') {
    return (
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-surface)' }}>
          <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
            <TableHeader title="Model" />
            <TableHeader title="Calls" />
            <TableHeader title="Avg" />
            <TableHeader title="p95" />
            <TableHeader title="p99" />
            <TableHeader title="Tokens" />
          </tr>
        </thead>
        <tbody>
          {models.length === 0
            ? emptyRow
            : models.map((r) => (
                <tr key={r.name} className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-3 text-white">{r.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.callCount.toLocaleString()}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.avgMs} ms</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.p95Ms} ms</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.p99Ms} ms</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.totalTokens.toLocaleString()}</td>
                </tr>
              ))}
        </tbody>
      </table>
    )
  }

  if (view === 'tools') {
    return (
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-surface)' }}>
          <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
            <TableHeader title="Tool" />
            <TableHeader title="Calls" />
            <TableHeader title="Avg" />
            <TableHeader title="p95" />
            <TableHeader title="p99" />
            <TableHeader title="Success" />
          </tr>
        </thead>
        <tbody>
          {tools.length === 0
            ? emptyRow
            : tools.map((r) => (
                <tr key={r.name} className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-3 text-white">{r.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.callCount.toLocaleString()}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.avgMs} ms</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.p95Ms} ms</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.p99Ms} ms</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.successRate}%</td>
                </tr>
              ))}
        </tbody>
      </table>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-surface)' }}>
        <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
          <TableHeader title="MCP" />
          <TableHeader title="Calls" />
          <TableHeader title="Avg" />
          <TableHeader title="p95" />
          <TableHeader title="p99" />
          <TableHeader title="Success" />
          <TableHeader title="Errors" />
        </tr>
      </thead>
      <tbody>
        {mcps.length === 0
          ? emptyRow
          : mcps.map((r) => (
              <tr key={r.name} className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-4 py-3 text-white">{r.name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.callCount.toLocaleString()}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.avgMs} ms</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.p95Ms} ms</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.p99Ms} ms</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.successRate}%</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>{r.errorCount}</td>
              </tr>
            ))}
      </tbody>
    </table>
  )
}

export default function PerformancePage() {
  const [window, setWindow] = useState<StatsWindow>('24h')
  const [view, setView] = useState<PerfView>('models')
  const [selectedMcp, setSelectedMcp] = useState<string>('')
  const [queryText, setQueryText] = useState('')
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  const resetPaging = () => setOffset(0)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['performance', view, window, selectedMcp, queryText, limit, offset],
    queryFn: () => api.performance.summary({
      view,
      window,
      mcpName: selectedMcp || undefined,
      q: queryText || undefined,
      limit,
      offset,
    }),
    refetchInterval: 10_000,
  })

  const mcpOptions = useMemo(() => data?.availableMcps ?? [], [data?.availableMcps])
  const totalCalls = useMemo(() => {
    if (!data) return 0
    const rows = view === 'models' ? data.models : view === 'tools' ? data.tools : data.mcps
    return rows.reduce((acc, row) => acc + row.callCount, 0)
  }, [data, view])

  const maxP99 = useMemo(() => {
    if (!data) return 0
    const rows = view === 'models' ? data.models : view === 'tools' ? data.tools : data.mcps
    return rows.reduce((acc, row) => Math.max(acc, row.p99Ms), 0)
  }, [data, view])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg font-semibold text-white">Performance</h1>
        <div className="flex items-center gap-2">
          <select
            className="text-sm rounded px-3 py-1.5 border"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            value={window}
            onChange={(e) => {
              setWindow(e.target.value as StatsWindow)
              resetPaging()
            }}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          {view === 'mcps' && (
            <select
              className="text-sm rounded px-3 py-1.5 border"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              value={selectedMcp}
              onChange={(e) => {
                setSelectedMcp(e.target.value)
                resetPaging()
              }}
            >
              <option value="">All MCPs</option>
              {mcpOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <input
            value={queryText}
            onChange={(e) => {
              setQueryText(e.target.value)
              resetPaging()
            }}
            placeholder={view === 'models' ? 'Search model' : view === 'tools' ? 'Search tool' : 'Search MCP'}
            className="text-sm rounded px-3 py-1.5 border min-w-[180px]"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <select
            className="text-sm rounded px-3 py-1.5 border"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            value={String(limit)}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setOffset(0)
            }}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {VIEWS.map((key) => {
          const active = view === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setView(key)
                setOffset(0)
              }}
              className="px-4 py-2 text-sm rounded-full border transition-all"
              style={{
                borderColor: active ? '#38bdf8' : 'var(--color-border)',
                color: active ? '#e0f2fe' : 'var(--color-text)',
                background: active
                  ? 'linear-gradient(90deg, rgba(14,116,144,0.35), rgba(37,99,235,0.35))'
                  : 'var(--color-surface)',
                boxShadow: active ? '0 0 0 1px rgba(56,189,248,0.15) inset' : 'none',
              }}
            >
              {key === 'models' ? 'Models' : key === 'tools' ? 'Tools' : 'MCPs'}
            </button>
          )
        })}
      </div>

      {!isLoading && !isError && data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <SectionCard
            title="View"
            subtitle="Active category"
            value={view === 'models' ? 'Models' : view === 'tools' ? 'Tools' : 'MCPs'}
            accent="linear-gradient(120deg, rgba(14,165,233,0.8), rgba(59,130,246,0.25))"
          />
          <SectionCard
            title="Total Calls"
            subtitle="In selected window"
            value={totalCalls.toLocaleString()}
            accent="linear-gradient(120deg, rgba(16,185,129,0.8), rgba(34,197,94,0.25))"
          />
          <SectionCard
            title="Worst p99"
            subtitle="Tail latency hotspot"
            value={`${maxP99} ms`}
            accent="linear-gradient(120deg, rgba(245,158,11,0.8), rgba(239,68,68,0.2))"
          />
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--color-muted)' }}>Loading performance metrics…</div>}
      {isError && <div className="text-red-400">Failed to load performance metrics</div>}

      {!isLoading && !isError && data && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          <div className="px-4 py-3 border-b text-sm font-semibold text-white flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
            <span>
              {view === 'models' ? 'LLM Models' : view === 'tools' ? 'Tools' : 'MCP Calls'}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {new Date(data.from).toLocaleString()} - {new Date(data.to).toLocaleString()}
            </span>
          </div>
          <div className="max-h-[62vh] overflow-auto">
            <DataTable view={view} models={data.models} tools={data.tools} mcps={data.mcps} />
          </div>
          <div
            className="px-4 py-3 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Showing {offset + 1} - {offset + (view === 'models' ? data.models.length : view === 'tools' ? data.tools.length : data.mcps.length)}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded border text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                disabled={offset === 0}
                onClick={() => setOffset((v) => Math.max(0, v - limit))}
              >
                Prev
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded border text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                disabled={!data.paging.hasMore}
                onClick={() => setOffset((v) => v + limit)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
