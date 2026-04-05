import { useState } from 'react'

export interface PaginationState {
  cursor: string | undefined
  history: string[]
  nextPage: (nextCursor: string | undefined) => void
  prevPage: () => void
  reset: () => void
}

/** Reusable cursor-based pagination hook (DRY-1). */
export function usePagination(): PaginationState {
  const [cursor, setCursor] = useState<string | undefined>()
  const [history, setHistory] = useState<string[]>([])

  function nextPage(nextCursor: string | undefined) {
    if (nextCursor) {
      setHistory((h) => [...h, cursor ?? ''])
      setCursor(nextCursor)
    }
  }

  function prevPage() {
    const prev = history.at(-1)
    setHistory((h) => h.slice(0, -1))
    setCursor(prev === '' ? undefined : prev)
  }

  function reset() {
    setCursor(undefined)
    setHistory([])
  }

  return { cursor, history, nextPage, prevPage, reset }
}
