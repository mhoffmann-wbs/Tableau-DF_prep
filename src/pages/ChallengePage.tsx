import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { challengeStatus } from '../challenges/answer'
import { ChallengeContext, challengeComponents } from '../challenges/components'
import { OBJECTIVE_BY_ID, TASK_BY_ID } from '../content/blueprint'
import { CHALLENGES, CHALLENGE_BY_ID } from '../content/challenges'
import { useProgress } from '../progress/store'

/** `/build/challenges/:challengeId`: a Tableau Public challenge with its checklist and checkpoints. */
export default function ChallengePage() {
  const { challengeId = '' } = useParams()
  return <ChallengeView key={challengeId} id={challengeId} />
}

function ChallengeView({ id }: { id: string }) {
  const record = useProgress().challenges[id]
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  const challenge = CHALLENGE_BY_ID.get(id)
  if (!challenge) {
    return (
      <p>
        No such challenge.{' '}
        <Link to="/build/challenges" className="underline">
          All challenges
        </Link>
      </p>
    )
  }
  const { meta, Content } = challenge
  const task = TASK_BY_ID.get(meta.taskId)!
  const status = challengeStatus(meta, record)
  const index = CHALLENGES.indexOf(challenge)
  const next = CHALLENGES[index + 1]
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-500">
          <Link to="/build/challenges" className="hover:underline">
            Tableau Public challenges
          </Link>{' '}
          / {index + 1} of {CHALLENGES.length}
        </p>
        <h1 className="text-3xl font-bold">{meta.title}</h1>
        <p className="text-slate-600">{meta.summary}</p>
        <p className="text-sm text-slate-600">
          Lesson:{' '}
          <Link to={`/learn/${task.id}`} className="text-brand-dark underline">
            {task.id} {task.title}
          </Link>{' '}
          · Steps checked against the lessons and the help on {meta.updated}
        </p>
        <p role="status" className={`text-sm ${status.done ? 'text-green-700' : 'text-slate-600'}`}>
          {status.done ? '✓ Challenge complete. ' : ''}
          {status.steps} of {status.stepsTotal} steps ticked, {status.checkpoints} of {status.checkpointsTotal} checkpoints answered.
        </p>
      </header>
      <div className="prose max-w-none prose-a:text-brand-dark prose-code:before:content-none prose-code:after:content-none">
        <ChallengeContext value={meta}>
          <Content components={challengeComponents} />
        </ChallengeContext>
      </div>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">Objectives practised</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {meta.objectives.map((o) => (
              <li key={o}>
                <span className="mr-2 font-mono text-xs text-slate-400">{o}</span>
                {OBJECTIVE_BY_ID.get(o)?.text}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">Sources</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {meta.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noreferrer" className="text-brand-dark underline">
                  {link.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <footer className="flex flex-wrap gap-3">
        <Link to="/build/challenges" className="rounded border border-slate-300 px-3 py-1.5 text-sm">
          All challenges
        </Link>
        {next && (
          <Link to={`/build/challenges/${next.meta.id}`} className="rounded bg-brand px-3 py-1.5 text-sm text-chalk">
            Next: {next.meta.title}
          </Link>
        )}
      </footer>
    </article>
  )
}
