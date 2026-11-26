import { Link } from 'react-router'
import { challengeStatus } from '../challenges/answer'
import { CHALLENGES } from '../content/challenges'
import { useProgress } from '../progress/store'

/** `/build/challenges`: the Tableau Public challenges with their done marks. */
export default function ChallengeListPage() {
  const { challenges } = useProgress()
  const done = CHALLENGES.filter((c) => challengeStatus(c.meta, challenges[c.meta.id]).done).length
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Tableau Public challenges</h1>
      <p className="text-slate-600">
        Build in the real thing: download the Driftlight files, follow the steps in the free Tableau Desktop Public Edition and check the
        numbers your views show. {done} of {CHALLENGES.length} complete. Challenges don’t count towards exam readiness.
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {CHALLENGES.map(({ meta }, i) => (
          <li key={meta.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <Link to={`/build/challenges/${meta.id}`} className="font-medium text-brand-dark underline">
              {i + 1}. {meta.title}
            </Link>
            {challengeStatus(meta, challenges[meta.id]).done && (
              <span className="ml-2 text-sm text-green-600" aria-label="complete">
                ✓
              </span>
            )}
            <p className="mt-0.5 text-sm text-slate-600">{meta.summary}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
