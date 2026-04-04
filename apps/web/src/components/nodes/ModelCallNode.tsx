import { Handle, Position } from '@xyflow/react'
import type { RFNodeData } from '../../types'

interface Props {
  data: RFNodeData
  selected?: boolean
}

export default function ModelCallNode({ data, selected }: Props) {
  const failed = data.status === 'failed'
  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[160px] text-xs shadow ${
        selected ? 'ring-2 ring-white' : ''
      } ${failed ? 'border-red-600 bg-red-950' : 'border-green-600 bg-green-950'}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="font-semibold text-white mb-1 truncate">{data.label}</div>
      {data.latencyMs != null && (
        <div className="text-slate-400">{data.latencyMs} ms</div>
      )}
      {data.costUsd != null && (
        <div className="text-slate-400">${data.costUsd.toFixed(4)}</div>
      )}
      {data.inputTokens != null && (
        <div className="text-slate-400">
          {data.inputTokens}↑ {data.outputTokens ?? 0}↓ tok
        </div>
      )}
      {data.failureReason && (
        <div className="text-red-400 mt-1 text-[10px] truncate">{data.failureReason}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}
