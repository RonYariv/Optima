import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import AgentNode from '../components/nodes/AgentNode'
import ModelCallNode from '../components/nodes/ModelCallNode'
import ToolCallNode from '../components/nodes/ToolCallNode'
import type { RFNodeData, AuditEvent, AuditEventKind } from '../types'

const nodeTypes = {
  agent: AgentNode,
  model_call: ModelCallNode,
  tool_call: ToolCallNode,
}

type AppNode = Node<RFNodeData>

type Tab = 'graph' | 'audit-log'

// ── Audit log helpers ─────────────────────────────────────────────────────────

const KIND_LABEL: Record<AuditEventKind, string> = {
  agent_start: 'Agent Start',
  agent_end: 'Agent End',
  agent_handoff: 'Handoff',
  model_call: 'Model Call',
  tool_call: 'Tool Call',
  mcp_call: 'MCP Call',
  custom: 'Custom',
}

const KIND_COLOR: Record<AuditEventKind, string> = {
  agent_start: '#22c55e',
  agent_end: '#94a3b8',
  agent_handoff: '#a78bfa',
  model_call: '#38bdf8',
  tool_call: '#fb923c',
  mcp_call: '#f472b6',
  custom: '#cbd5e1',
}

function AuditLogTimeline({ events }: { events: AuditEvent[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (events.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-48 text-sm"
        style={{ color: 'var(--color-muted)' }}
      >
        No audit events recorded for this trace.
      </div>
    )
  }

  return (
    <div className="relative">
      {/* vertical line */}
      <div
        className="absolute left-[18px] top-0 bottom-0 w-px"
        style={{ backgroundColor: 'var(--color-border)' }}
      />
      <ol className="space-y-1 pl-10">
        {events.map((ev) => {
          const isOpen = expanded === ev.id
          const color = KIND_COLOR[ev.kind] ?? '#cbd5e1'
          const label = KIND_LABEL[ev.kind] ?? ev.kind
          return (
            <li key={ev.id}>
              {/* dot */}
              <span
                className="absolute left-[11px] mt-[14px] w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: color, backgroundColor: 'var(--color-bg)' }}
              />
              <button
                className="w-full text-left rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                style={{ backgroundColor: isOpen ? 'rgba(255,255,255,0.05)' : undefined }}
                onClick={() => setExpanded(isOpen ? null : ev.id)}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium" style={{ color }}>
                    {label}
                  </span>
                  {ev.name && (
                    <span className="text-white truncate max-w-[200px]">{ev.name}</span>
                  )}
                  {ev.actorId && (
                    <span style={{ color: 'var(--color-muted)' }} className="text-xs truncate">
                      {ev.actorId}
                    </span>
                  )}
                  <span className="ml-auto text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>
                    #{ev.sequenceNo}
                    {ev.latencyMs != null && ` · ${ev.latencyMs} ms`}
                    {ev.success === false && (
                      <span className="ml-1 text-red-400">✗ failed</span>
                    )}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  {new Date(ev.occurredAt).toLocaleTimeString()}
                </div>
              </button>

              {isOpen && (
                <div
                  className="mx-3 mb-2 p-3 rounded text-xs font-mono space-y-2"
                  style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'var(--color-muted)' }}
                >
                  {ev.input && (
                    <div>
                      <span className="text-slate-400 mr-1">input:</span>
                      <span className="text-slate-300 break-all">
                        {JSON.stringify(ev.input, null, 2)}
                      </span>
                    </div>
                  )}
                  {ev.output && (
                    <div>
                      <span className="text-slate-400 mr-1">output:</span>
                      <span className="text-slate-300 break-all">
                        {JSON.stringify(ev.output, null, 2)}
                      </span>
                    </div>
                  )}
                  {ev.error && (
                    <div className="text-red-400">
                      error: {ev.error.type ?? ''} {ev.error.message ?? ''}
                    </div>
                  )}
                  {!ev.input && !ev.output && !ev.error && (
                    <span style={{ color: 'var(--color-muted)' }}>no payload</span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>()
  const [tab, setTab] = useState<Tab>('graph')
  const [selectedNode, setSelectedNode] = useState<AppNode | null>(null)

  const traceQuery = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => api.traces.get(traceId!),
    enabled: !!traceId,
  })

  const graphQuery = useQuery({
    queryKey: ['trace-graph', traceId],
    queryFn: () => api.traces.graph(traceId!),
    enabled: !!traceId && tab === 'graph',
  })

  const auditLogQuery = useQuery({
    queryKey: ['trace-audit-log', traceId],
    queryFn: () => api.traces.auditLog(traceId!),
    enabled: !!traceId && tab === 'audit-log',
  })

  const onNodeClick = useCallback<NodeMouseHandler<AppNode>>((_evt, node) => {
    setSelectedNode(node)
  }, [])

  if (traceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-96" style={{ color: 'var(--color-muted)' }}>
        Loading trace…
      </div>
    )
  }

  if (traceQuery.isError) {
    return (
      <div className="text-red-400 p-6">Failed to load trace data</div>
    )
  }

  const trace = traceQuery.data

  const tabClass = (t: Tab) =>
    `px-3 py-1.5 text-sm rounded transition-colors ${
      tab === t
        ? 'text-white font-medium'
        : 'text-slate-400 hover:text-slate-200'
    }`

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link to="/traces" className="text-sky-400 hover:text-sky-300 text-sm">← Traces</Link>
        <span style={{ color: 'var(--color-muted)' }}>/</span>
        <span className="font-mono text-sm text-white">{traceId?.slice(0, 12)}…</span>
        {trace && <StatusBadge status={trace.status} />}
      </div>

      {trace && (
        <div className="flex gap-4 mb-4 text-sm" style={{ color: 'var(--color-muted)' }}>
          <span>Agent: <span className="text-white">{trace.agentId}</span></span>
          <span>Started: <span className="text-white">{new Date(trace.startedAt).toLocaleString()}</span></span>
          {trace.totalCostUsd != null && (
            <span>Cost: <span className="text-white">${trace.totalCostUsd.toFixed(4)}</span></span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 mb-4 border-b pb-1"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button className={tabClass('graph')} onClick={() => setTab('graph')}>
          Graph
        </button>
        <button className={tabClass('audit-log')} onClick={() => setTab('audit-log')}>
          Audit Log
          {auditLogQuery.data && (
            <span
              className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs"
              style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-muted)' }}
            >
              {auditLogQuery.data.data.length}
            </span>
          )}
        </button>
      </div>

      {/* Graph tab */}
      {tab === 'graph' && (
        <div className="flex gap-4">
          <div
            className="flex-1 rounded-lg border overflow-hidden"
            style={{ height: 520, borderColor: 'var(--color-border)' }}
          >
            {graphQuery.isLoading ? (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-muted)' }}>
                Loading graph…
              </div>
            ) : graphQuery.isError ? (
              <div className="flex items-center justify-center h-full text-red-400 text-sm">
                Failed to load graph data
              </div>
            ) : !graphQuery.data?.nodes?.length ? (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-muted)' }}>
                No graph data available
              </div>
            ) : (
              <ReactFlow
                key={traceId}
                defaultNodes={graphQuery.data.nodes as AppNode[]}
                defaultEdges={graphQuery.data.edges as Edge[]}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                colorMode="dark"
              >
                <Background />
                <Controls />
                <MiniMap nodeColor="#475569" maskColor="rgba(15,17,23,0.7)" />
              </ReactFlow>
            )}
          </div>

          {/* Side panel */}
          {selectedNode && (
            <div
              className="w-64 rounded-lg border p-4 shrink-0 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Node Detail</h3>
                <button
                  className="text-slate-400 hover:text-white"
                  onClick={() => setSelectedNode(null)}
                >
                  ✕
                </button>
              </div>
              <dl className="space-y-2">
                <Row label="Type" value={selectedNode.type ?? '—'} />
                <Row label="Label" value={selectedNode.data.label} />
                {selectedNode.data.status && <Row label="Status" value={selectedNode.data.status} />}
                {selectedNode.data.latencyMs != null && (
                  <Row label="Latency" value={`${selectedNode.data.latencyMs} ms`} />
                )}
                {selectedNode.data.costUsd != null && (
                  <Row label="Cost" value={`$${selectedNode.data.costUsd.toFixed(4)}`} />
                )}
                {selectedNode.data.inputTokens != null && (
                  <Row label="Tokens in" value={String(selectedNode.data.inputTokens)} />
                )}
                {selectedNode.data.outputTokens != null && (
                  <Row label="Tokens out" value={String(selectedNode.data.outputTokens)} />
                )}
                {selectedNode.data.toolName && (
                  <Row label="Tool" value={selectedNode.data.toolName} />
                )}
                {selectedNode.data.success != null && (
                  <Row label="Success" value={selectedNode.data.success ? 'yes' : 'no'} />
                )}
                {selectedNode.data.errorType && (
                  <Row label="Error type" value={selectedNode.data.errorType} />
                )}
                {selectedNode.data.failureReason && (
                  <Row label="Failure" value={selectedNode.data.failureReason} />
                )}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Audit log tab */}
      {tab === 'audit-log' && (
        <div
          className="rounded-lg border p-4 overflow-y-auto"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', maxHeight: 560 }}
        >
          {auditLogQuery.isLoading ? (
            <div className="flex items-center justify-center h-48" style={{ color: 'var(--color-muted)' }}>
              Loading audit log…
            </div>
          ) : auditLogQuery.isError ? (
            <div className="text-red-400 text-sm p-4">Failed to load audit log.</div>
          ) : (
            <AuditLogTimeline events={auditLogQuery.data?.data ?? []} />
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: 'var(--color-muted)' }}>{label}</dt>
      <dd className="text-white truncate">{value}</dd>
    </div>
  )
}

