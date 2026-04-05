import { useState } from 'react'
import { tokenStore } from '../lib/token-store'

interface Props {
  onSave: () => void
}

export default function TokenGate({ onSave }: Props) {
  const [value, setValue] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    tokenStore.set(trimmed)
    onSave()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <form
        onSubmit={submit}
        className="rounded-xl border p-8 w-full max-w-md flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <h1 className="text-xl font-semibold text-white">Agent Optima</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Paste your JWT to access the dashboard.
        </p>
        <textarea
          className="rounded border text-sm p-2 font-mono resize-none focus:outline-none focus:border-sky-500"
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
            minHeight: 80,
          }}
          placeholder="eyJhbGciOi..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button
          type="submit"
          className="rounded px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 transition-colors"
        >
          Enter Dashboard
        </button>
      </form>
    </div>
  )
}
