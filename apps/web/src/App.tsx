import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import TokenGate from './components/TokenGate'
import TracesPage from './pages/TracesPage'
import TraceDetailPage from './pages/TraceDetailPage'
import FailuresPage from './pages/FailuresPage'
import CostPage from './pages/CostPage'
import { tokenStore } from './lib/token-store'

export default function App() {
  const [hasToken, setHasToken] = useState(() => !!tokenStore.get())

  if (!hasToken) return <TokenGate onSave={() => setHasToken(true)} />

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/traces" replace />} />
        <Route path="traces" element={<TracesPage />} />
        <Route path="traces/:traceId" element={<TraceDetailPage />} />
        <Route path="failures" element={<FailuresPage />} />
        <Route path="cost" element={<CostPage />} />
      </Route>
    </Routes>
  )
}
