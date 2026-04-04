const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-slate-800 text-slate-300 border-slate-600',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  high: 'bg-orange-900 text-orange-300 border-orange-700',
  critical: 'bg-red-900 text-red-300 border-red-700',
}

interface Props {
  severity: string
}

export default function SeverityBadge({ severity }: Props) {
  const cls = SEVERITY_COLORS[severity] ?? 'bg-slate-800 text-slate-300 border-slate-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {severity}
    </span>
  )
}
