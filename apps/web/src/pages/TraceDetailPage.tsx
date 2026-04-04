import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
import type { RFNodeData } from '../types'

const nodeTypes = {
  agent: AgentNode,
  model_call: ModelCallNode,
  tool_call: ToolCallNode,
}

type AppNode = Node<RFNodeData>

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>()
  const [selectedNode, setSelectedNode] = useState<AppNode | null>(null)

  const traceQuery = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => api.traces.get(traceId!),
    enabled: !!traceId,
  })

  const graphQuery = useQuery({
    queryKey: ['trace-graph', traceId],
    queryFn: () => api.traces.graph(traceId!),
    enabled: !!traceId,
  })

  const initialNodes = (graphQuery.data?.nodes ?? []) as AppNode[]
  const initialEdges = (graphQuery.data?.edges ?? []) as Edge[]

  const [nodes, , onNodesChange] = useNodesState<AppNode>(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState<Edge>(initialEdges)

  const onNodeClick = useCallback<NodeMouseHandler<AppNode>>((_evt, node) => {
    setSelectedNode(node)
  }, [])

  if (traceQuery.isLoading || graphQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-96" style={{ color: 'var(--color-muted)' }}>
        Loading trace…
      </div>
    )
  }

  if (traceQuery.isError || graphQuery.isError) {
    return (
      <div className="text-red-400 p-6">Failed to load trace data</div>
    )
  }

  const trace = traceQuery.data

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

      <div className="flex gap-4">
        {/* Graph */}
        <div
          className="flex-1 rounded-lg border overflow-hidden"
          style={{ height: 520, borderColor: 'var(--color-border)' }}
        >
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-muted)' }}>
              No graph data available
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
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
