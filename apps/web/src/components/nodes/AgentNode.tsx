import { Handle, Position } from '@xyflow/react'
import type { RFNodeData } from '../../types'

interface Props {
  data: RFNodeData
  selected?: boolean
}

export default function AgentNode({ data, selected }: Props) {
  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 min-w-[180px] text-xs shadow-lg ${
        selected ? 'border-white' : 'border-purple-500'
      } bg-purple-950`}
    >
      <div className="font-bold text-purple-200 text-sm mb-1">{data.label}</div>
      {data.status && (
        <div className="text-purple-400 capitalize">{data.status}</div>
      )}
      {data.latencyMs != null && (
        <div className="text-slate-400 mt-1">{data.latencyMs} ms</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  )
}
