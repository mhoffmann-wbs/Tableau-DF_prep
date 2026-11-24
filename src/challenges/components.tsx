import type { MDXComponents } from 'mdx/types'
import { type ReactNode, createContext, useId, useState, use } from 'react'
import type { ChallengeMeta } from '../content/schema'
import { A, Callout } from '../lessons/components'
import { recordCheckpoint, setChallengeStep, useProgress } from '../progress/store'
import { answerMatches } from './answer'

// MDX components for Tableau Public challenges. Steps and checkpoints are
// declared in the challenge's `meta` and referenced by id, so progress keys and
// answers are data a test can check without parsing MDX.
export const ChallengeContext = createContext<ChallengeMeta | undefined>(undefined)

function useMeta(): ChallengeMeta {
  const meta = use(ChallengeContext)
  if (!meta) throw new Error('Challenge components need a ChallengeContext')
  return meta
}

const OPTIONAL_BADGE = {
  free: 'Optional · Desktop Free Edition',
  unverified: 'Optional · may not be in Tableau Public',
} as const

/** A checklist step from `meta.steps`; its instructions are the children. */
export function Step({ id, children }: { id: string; children: ReactNode }) {
  const meta = useMeta()
  const step = meta.steps.find((s) => s.id === id)
  if (!step) throw new Error(`Unknown challenge step "${id}"`)
  const done = useProgress().challenges[meta.id]?.steps.includes(id) ?? false
  const labelId = useId()
  return (
    <section className="not-prose my-4 flex gap-3 rounded-lg border border-slate-200 bg-white p-4" aria-labelledby={labelId}>
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0"
        checked={done}
        onChange={(e) => setChallengeStep(meta.id, id, e.target.checked)}
        aria-labelledby={labelId}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex flex-wrap items-baseline gap-2">
          <span id={labelId} className={`font-semibold ${done ? 'text-slate-500 line-through' : ''}`}>
            {meta.steps.indexOf(step) + 1}. {step.label}
          </span>
          {step.optional && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">{OPTIONAL_BADGE[step.optional]}</span>}
        </p>
        <div className="prose prose-sm max-w-none prose-a:text-brand-dark prose-code:before:content-none prose-code:after:content-none">{children}</div>
      </div>
    </section>
  )
}

/** A question the learner answers from their own viz; the answer comes from `meta.checkpoints`. */
export function Checkpoint({ id }: { id: string }) {
  const meta = useMeta()
  const checkpoint = meta.checkpoints.find((c) => c.id === id)
  if (!checkpoint) throw new Error(`Unknown challenge checkpoint "${id}"`)
  const solved = useProgress().challenges[meta.id]?.checkpoints.includes(id) ?? false
  const [input, setInput] = useState('')
  const [verdict, setVerdict] = useState<'right' | 'wrong'>()
  const [shown, setShown] = useState(false)
  const inputId = useId()
  const check = () => {
    const right = answerMatches(input, checkpoint.answer)
    setVerdict(right ? 'right' : 'wrong')
    if (right) recordCheckpoint(meta.id, id)
  }
  return (
    <div className="not-prose my-4 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <label htmlFor={inputId} className="block font-medium">
        {checkpoint.question}
      </label>
      {solved ? (
        <p className="text-green-700">
          ✓ <strong>{checkpoint.answer.says}</strong>
        </p>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            check()
          }}
        >
          <input
            id={inputId}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setVerdict(undefined)
            }}
            className="w-48 rounded border border-slate-300 bg-white px-2 py-1"
            autoComplete="off"
          />
          <button type="submit" className="rounded bg-brand px-3 py-1 text-sm text-chalk" disabled={!input.trim()}>
            Check
          </button>
          <button type="button" onClick={() => setShown(true)} className="text-sm text-slate-600 underline">
            Show the answer
          </button>
          {verdict === 'wrong' && (
            <span role="status" className="text-sm text-red-700">
              Not quite. Check the filters and the aggregation in your view.
            </span>
          )}
        </form>
      )}
      {shown && !solved && (
        <p className="text-sm text-slate-600">
          Answer: <strong>{checkpoint.answer.says}</strong>. Type it in once your view shows it.
        </p>
      )}
    </div>
  )
}

/** Download links for the challenge's files from public/data/. */
export function DataFiles() {
  const { files } = useMeta()
  return (
    <ul className="not-prose my-4 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f}>
          <a href={`${import.meta.env.BASE_URL}data/${f}`} download className="inline-block rounded border border-slate-300 bg-white px-3 py-1 font-mono text-sm text-brand-dark hover:bg-slate-50">
            ⤓ {f}
          </a>
        </li>
      ))}
    </ul>
  )
}

export const challengeComponents: MDXComponents = { Step, Checkpoint, DataFiles, Callout, a: A }
