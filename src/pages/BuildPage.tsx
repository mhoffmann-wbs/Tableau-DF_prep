import { Link } from 'react-router'
import { SANDBOX_CHALLENGES } from '../content/sandbox'
import { useProgress } from '../progress/store'

export default function BuildPage() {
  const solved = useProgress().sandbox
  const done = SANDBOX_CHALLENGES.filter((c) => solved[c.id] !== undefined).length
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Build</h1>
      <p className="text-slate-600">
        The exam has no hands-on items, but it asks what a view shows and how to build it. Practise that here with the Driftlight data, no
        Tableau licence needed.
      </p>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">
          <Link to="/build/sandbox" className="text-brand-dark underline">
            Viz builder sandbox
          </Link>
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          A schematic Tableau-style worksheet: a Data pane, the Filters shelf, the Marks card, Columns and Rows, and pills that turn blue or
          green. Build anything you like.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Make this chart</h2>
        <p className="text-sm text-slate-600">
          Each challenge shows a target chart; rebuild it in the sandbox and check it. {done} of {SANDBOX_CHALLENGES.length} solved. Challenges
          don’t count towards exam readiness.
        </p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {SANDBOX_CHALLENGES.map((c, i) => (
            <li key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <Link to={`/build/sandbox/${c.id}`} className="font-medium text-brand-dark underline">
                {i + 1}. {c.title}
              </Link>
              {solved[c.id] !== undefined && (
                <span className="ml-2 text-sm text-green-600" aria-label="solved">
                  ✓
                </span>
              )}
              <p className="mt-0.5 text-xs text-slate-500">Objectives {c.objectives.join(', ')}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
