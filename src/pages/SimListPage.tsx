import { Link } from 'react-router'
import { SIMS } from '../content/sims'

/** `/build/sim`: the concept simulators. */
export default function SimListPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Concept simulators</h1>
      <p className="text-slate-600">Change one thing and watch what Tableau does. Each ends with a few exam questions.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {SIMS.map((s) => (
          <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <Link to={`/build/sim/${s.id}`} className="font-medium text-brand-dark underline">
              {s.title}
            </Link>
            <p className="mt-0.5 text-sm text-slate-600">{s.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
