import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'

/** The footer's notices; printed guides repeat them, since the footer doesn't print. */
export const NOT_AFFILIATED = 'Not affiliated with or endorsed by Salesforce, Inc. or Tableau. Tableau and Salesforce are trademarks of Salesforce, Inc.'
export const INVENTED_DATA = 'Driftlight and its data are invented for this app.'

type NavEntry = { to: string; label: string; end?: boolean }

/** The main nav groups pages by what the learner does; Progress stands on its own. */
const NAV_GROUPS: { id: string; label: string; links: NavEntry[] }[] = [
  {
    id: 'learn',
    label: 'Learn',
    links: [
      { to: '/learn', label: 'Lessons' },
      { to: '/guides/cheat-sheet', label: 'Cheat sheet' },
      { to: '/guides/exam-day', label: 'Exam day' },
    ],
  },
  {
    id: 'quiz',
    label: 'Quiz',
    links: [
      { to: '/practice', label: 'Practice' },
      { to: '/questions', label: 'Questions' },
      { to: '/mock', label: 'Mock exam' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    links: [
      // The overview also lists the simulators and the challenges.
      { to: '/build', label: 'Overview', end: true },
      { to: '/build/sandbox', label: 'Viz sandbox' },
      { to: '/build/calc', label: 'Calc playground' },
      { to: '/build/flashcards', label: 'Flashcards' },
    ],
  },
]

const isUnder = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block py-1 ${isActive ? 'font-semibold underline underline-offset-4' : 'text-chalk/80 hover:text-chalk'}`

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  // The desktop dropdown that is open, if any (phones show every group in the menu).
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  const closeAll = () => {
    setMenuOpen(false)
    setOpenGroup(null)
  }

  // A click outside the nav or Escape closes the dropdown; Escape returns focus to its button.
  useEffect(() => {
    if (!openGroup) return
    const onPointer = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      document.getElementById(`nav-${openGroup}-button`)?.focus()
      setOpenGroup(null)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [openGroup])

  return (
    <div className="flex min-h-screen flex-col bg-page text-slate-900 print:bg-white">
      <header className="bg-header text-chalk print:hidden">
        <nav ref={navRef} aria-label="Main" className="mx-auto max-w-5xl px-4 py-3 sm:flex sm:items-center sm:gap-x-8 sm:text-sm">
          <div className="flex items-center justify-between">
            <Link to="/" onClick={closeAll} className="text-lg font-bold tracking-tight">
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
          <ul
            id="main-links"
            className={`${menuOpen ? 'mt-3 grid grid-cols-2 gap-x-4 gap-y-4' : 'hidden'} sm:mt-0 sm:flex sm:items-center sm:gap-x-6`}
          >
            {NAV_GROUPS.map((group) => {
              const open = openGroup === group.id
              const active = group.links.some((l) => isUnder(pathname, l.to))
              return (
                <li key={group.id} className="sm:relative">
                  <span className="text-xs font-semibold uppercase tracking-wide text-chalk/60 sm:hidden">{group.label}</span>
                  <button
                    type="button"
                    id={`nav-${group.id}-button`}
                    aria-expanded={open}
                    aria-controls={`nav-${group.id}`}
                    onClick={() => setOpenGroup(open ? null : group.id)}
                    className={`hidden items-center gap-1 sm:inline-flex ${active ? 'font-semibold' : 'text-chalk/80 hover:text-chalk'}`}
                  >
                    {group.label}
                    <span aria-hidden="true" className="text-xs">
                      {open ? '▴' : '▾'}
                    </span>
                  </button>
                  <ul
                    id={`nav-${group.id}`}
                    className={`mt-1 sm:absolute sm:left-0 sm:top-full sm:z-20 sm:mt-2 sm:min-w-40 sm:rounded sm:bg-header sm:px-4 sm:py-2 sm:shadow-lg ${open ? 'sm:block' : 'sm:hidden'}`}
                  >
                    {group.links.map(({ to, label, end }) => (
                      <li key={to}>
                        <NavLink to={to} end={end} onClick={closeAll} className={linkClass}>
                          {label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
            <li>
              <NavLink to="/progress" onClick={closeAll} className={linkClass}>
                Progress
              </NavLink>
            </li>
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
