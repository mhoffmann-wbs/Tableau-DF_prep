import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'

/** The footer's notices; printed guides repeat them, since the footer doesn't print. */
export const NOT_AFFILIATED = 'Not affiliated with or endorsed by Salesforce, Inc. or Tableau. Tableau and Salesforce are trademarks of Salesforce, Inc.'
export const INVENTED_DATA = 'Driftlight and its data are invented for this app.'

// Links are added as their pages are built (PLAN.md §9).
const NAV: { to: string; label: string }[] = [
  { to: '/', label: 'Exam outline' },
  { to: '/learn', label: 'Learn' },
  { to: '/practice', label: 'Practice' },
  { to: '/questions', label: 'Questions' },
  { to: '/mock', label: 'Mock exam' },
  { to: '/build', label: 'Build' },
  { to: '/guides', label: 'Guides' },
  { to: '/progress', label: 'Progress' },
]

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex min-h-screen flex-col bg-page text-slate-900 print:bg-white">
      <header className="bg-header text-chalk print:hidden">
        <nav aria-label="Main" className="mx-auto max-w-5xl px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:text-sm">
          <div className="flex items-center justify-between">
            <Link to="/" onClick={() => setMenuOpen(false)} className="text-lg font-bold tracking-tight">
              Tableau<span className="text-accent">-DF</span> prep
            </Link>
            {/* Phones get a menu button instead of rows of links. */}
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="main-links"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded border border-chalk/40 px-3 py-1 text-sm sm:hidden"
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
          <ul id="main-links" className={`${menuOpen ? 'mt-3 grid grid-cols-2 gap-2' : 'hidden'} sm:contents`}>
            {NAV.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `block py-1 sm:py-0 ${isActive ? 'font-semibold underline underline-offset-4' : 'text-chalk/80'}`}
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-slate-200 px-4 py-4 text-center text-sm text-slate-500 print:hidden">
        <p>{NOT_AFFILIATED}</p>
        <p>{INVENTED_DATA}</p>
      </footer>
    </div>
  )
}
