import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import TokenGate from './components/TokenGate'
import TracesPage from './pages/TracesPage'
import TraceDetailPage from './pages/TraceDetailPage'
import FailuresPage from './pages/FailuresPage'
import CostPage from './pages/CostPage'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ao_token') ?? '')

  if (!token) return <TokenGate onSave={setToken} />

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
