import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { api } from '../lib/api'
import type { CostGroupBy, CostSummaryResponse } from '../types'

const GROUP_OPTIONS: { value: CostGroupBy; label: string }[] = [
  { value: 'day', label: 'By Day' },
  { value: 'model', label: 'By Model' },
  { value: 'agent', label: 'By Agent' },
]

export default function CostPage() {
  const [groupBy, setGroupBy] = useState<CostGroupBy>('day')

  const { data, isLoading, isError } = useQuery<CostSummaryResponse>({
    queryKey: ['cost-summary', groupBy],
    queryFn: () => api.cost.summary({ groupBy }),
  })

  const breakdown = data?.breakdown ?? []

  const chartData = breakdown.map((item) => ({
    name: item.key,
    cost: Math.round(item.costUsd * 10_000) / 10_000,
    tokens: item.tokenCount,
  }))

  const totalCost = data?.totalCostUsd ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-white">Cost Dashboard</h1>
        <select
          className="text-sm rounded px-3 py-1.5 border"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as CostGroupBy)}
        >
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Summary card */}
      <div
        className="rounded-lg border p-4 mb-6 inline-block"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <div className="text-sm" style={{ color: 'var(--color-muted)' }}>Total Cost</div>
        <div className="text-2xl font-bold text-white mt-1">${totalCost.toFixed(4)}</div>
      </div>

      {/* Bar chart */}
      <div
        className="rounded-lg border p-4 mb-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-48" style={{ color: 'var(--color-muted)' }}>
            Loading…
          </div>
        ) : isError ? (
          <div className="text-red-400 text-sm p-4">Failed to load cost data</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#2a2d3a' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#2a2d3a' }}
                tickLine={false}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1d27',
                  border: '1px solid #2a2d3a',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 12,
                }}
                formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cost']}
              />
              <Bar dataKey="cost" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Breakdown table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border)' }}>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>
                {GROUP_OPTIONS.find((o) => o.value === groupBy)?.label.replace('By ', '') ?? 'Key'}
              </th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Cost (USD)</th>
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--color-muted)' }}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((item) => (
              <tr
                key={item.key}
                className="border-t hover:bg-white/5 transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <td className="px-4 py-3 text-white">{item.key}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text)' }}>
                  ${Number(item.costUsd).toFixed(4)}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-muted)' }}>
                  {item.tokenCount.toLocaleString()}
                </td>
              </tr>
            ))}
            {!isLoading && breakdown.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center" style={{ color: 'var(--color-muted)' }}>
                  No cost data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
