import { Link } from 'react-router'
import { SANDBOX_CHALLENGES } from '../content/sandbox'
import { useProgress } from '../progress/store'

/** `/build/charts`: the "Make this chart" challenges, each solved in the sandbox. */
export default function ChartListPage() {
  const solved = useProgress().sandbox
  const done = SANDBOX_CHALLENGES.filter((c) => solved[c.id] !== undefined).length
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Make this chart</h1>
      <p className="text-slate-600">
        Each challenge shows a target chart; rebuild it in the{' '}
        <Link to="/build/sandbox" className="text-brand-dark underline">
          sandbox
        </Link>{' '}
        and check it. {done} of {SANDBOX_CHALLENGES.length} solved. Challenges don’t count towards exam readiness.
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
    </div>
  )
}
