import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import TracesPage from './pages/TracesPage'
import TraceDetailPage from './pages/TraceDetailPage'
import FailuresPage from './pages/FailuresPage'
import CostPage from './pages/CostPage'

export default function App() {
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
