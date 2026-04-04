import { Handle, Position } from '@xyflow/react'
import type { RFNodeData } from '../../types'

interface Props {
  data: RFNodeData
  selected?: boolean
}

export default function ToolCallNode({ data, selected }: Props) {
  const failed = data.success === false
  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[140px] text-xs shadow ${
        selected ? 'ring-2 ring-white' : ''
      } ${failed ? 'border-orange-600 bg-orange-950' : 'border-sky-600 bg-sky-950'}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="font-semibold text-white mb-1 truncate">{data.label}</div>
      {data.toolName && (
        <div className="text-sky-400 text-[10px]">{data.toolName}</div>
      )}
      {data.latencyMs != null && (
        <div className="text-slate-400">{data.latencyMs} ms</div>
      )}
      {data.errorType && (
        <div className="text-orange-400 mt-1 text-[10px] truncate">{data.errorType}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}
