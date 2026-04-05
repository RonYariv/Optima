interface Props {
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

/** Reusable prev/next pagination footer (DRY-1). */
export default function PaginationFooter({ hasPrev, hasNext, onPrev, onNext }: Props) {
  const btnClass =
    'px-3 py-1.5 text-sm rounded border disabled:opacity-40'
  const btnStyle = {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-surface)',
  }

  return (
    <div className="flex gap-2 mt-4 justify-end">
      <button
        className={btnClass}
        style={btnStyle}
        onClick={onPrev}
        disabled={!hasPrev}
      >
        ← Prev
      </button>
      <button
        className={btnClass}
        style={btnStyle}
        onClick={onNext}
        disabled={!hasNext}
      >
        Next →
      </button>
    </div>
  )
}
