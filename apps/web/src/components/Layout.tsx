import { NavLink, Outlet, Link } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition-colors ${isActive ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <nav
        className="flex items-center gap-6 px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <Link to="/traces" className="font-semibold text-white tracking-tight mr-2">
          Agent Optima
        </Link>
        <NavLink to="/traces" className={navLinkClass}>Traces</NavLink>
        <NavLink to="/failures" className={navLinkClass}>Failures</NavLink>
        <NavLink to="/cost" className={navLinkClass}>Cost</NavLink>
      </nav>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
