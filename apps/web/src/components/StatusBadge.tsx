const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-900 text-blue-300 border-blue-700',
  success: 'bg-green-900 text-green-300 border-green-700',
  failed: 'bg-red-900 text-red-300 border-red-700',
  partial: 'bg-yellow-900 text-yellow-300 border-yellow-700',
}

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-800 text-slate-300 border-slate-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status}
    </span>
  )
}
