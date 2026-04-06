import { NavLink, Outlet, Link } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition-colors ${isActive ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`

const isDev = import.meta.env.DEV

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
        <NavLink to="/performance" className={navLinkClass}>Performance</NavLink>
        <NavLink to="/failures" className={navLinkClass}>Failures</NavLink>
        <NavLink to="/cost" className={navLinkClass}>Cost</NavLink>
        {isDev && (
          <NavLink to="/sandbox" className={navLinkClass}>
            <span className="flex items-center gap-1.5">
              Sandbox
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 leading-none">
                dev
              </span>
            </span>
          </NavLink>
        )}
      </nav>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
