import { type ReactNode, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { DOMAINS, EXAM_FORMAT, TASKS, TASK_BY_ID, tasksOf } from '../content/blueprint'
import { ITEMS } from '../content/bank'
import type { Item } from '../content/schema'
import { sessionRng, shuffle } from '../data/rng'
import { weakSpotItems } from '../progress/readiness'
import { getProgress, recordAnswer } from '../progress/store'
import { type Response, grade, isAnswered } from '../quiz/grade'
import { ItemView } from '../quiz/ItemView'
import { taskRows } from '../quiz/results'
import { buildFocusSet, buildMixedSet, orderLeastMastered } from '../quiz/sampler'
import { ScoreTable } from '../quiz/ScoreTable'
import { SessionReview } from '../quiz/SessionReview'
import { ShortcutHint } from '../quiz/ShortcutHint'
import { useShortcuts } from '../quiz/shortcuts'
import { TASK_WEIGHTS } from '../quiz/weights'

/** Sizes offered for a mixed set; the last one matches the real exam length. */
const MIX_SIZES = [10, 20, EXAM_FORMAT.items]

const MODES = [
  { focus: false, label: 'Any question', hint: 'Random order. Mixed sets are weighted by the exam guide.' },
  {
    focus: true,
    label: 'Least mastered',
    hint: 'Within each task, items with the shortest run of correct answers come first (a wrong answer resets the run). Mixed sets keep the exam mix of tasks.',
  },
]

export default function PracticePage() {
  const [params] = useSearchParams()
  const taskId = params.get('task')
  const domainId = params.get('domain')
  const mix = Number(params.get('mix'))
  const focus = params.get('focus') === '1'
  // Progress is read once per selection (sessions keep their first order), so
  // answering during a session doesn't reshuffle it.
  const progress = getProgress()
  const rng = sessionRng()
  const streakOf = (id: string) => progress.items[id]?.streak ?? 0
  const suffix = focus ? ': least mastered' : ''
  // Bumping the round re-samples the same kind of set and remounts the session.
  const [round, setRound] = useState(0)
  const again = () => setRound((r) => r + 1)

  if (params.get('weak')) {
    const items = shuffle(weakSpotItems(TASKS, ITEMS, progress, TASK_WEIGHTS), rng)
    return <PracticeSession key={`weak|${round}`} items={items} label="Weak-spot drill" onAgain={again} />
  }
  if (mix > 0) {
    const items = focus ? buildFocusSet(ITEMS, TASK_WEIGHTS, mix, streakOf, rng) : buildMixedSet(ITEMS, TASK_WEIGHTS, mix, rng)
    return <PracticeSession key={`mix|${mix}|${focus}|${round}`} items={items} label={`Mixed set${suffix}`} onAgain={again} />
  }
  if (!taskId && !domainId) return <PracticePicker />

  const items = ITEMS.filter((i) => (taskId ? i.taskId === taskId : TASK_BY_ID.get(i.taskId)?.domainId === domainId))
  const label = taskId ? `${taskId} ${TASK_BY_ID.get(taskId)?.title ?? ''}` : `${domainId}. ${DOMAINS.find((d) => d.id === domainId)?.title ?? ''}`
  // Keying on the selection resets the session when the learner picks something else.
  return (
    <PracticeSession
      key={`${taskId}|${domainId}|${focus}|${round}`}
      items={focus ? orderLeastMastered(items, streakOf, rng) : shuffle(items, rng)}
      label={`${label}${suffix}`}
      onAgain={again}
    />
  )
}

function PracticePicker() {
  const [focus, setFocus] = useState(false)
  const count = (taskIds: string[]) => ITEMS.filter((i) => taskIds.includes(i.taskId)).length
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Practice</h1>
      <p className="text-slate-600">
        Pick a domain or a single task, or run a mixed set across the whole exam guide. You get feedback right after each item, with an
        explanation for every option. To pick single items by task, kind and mastery, open the{' '}
        <Link to="/questions" className="text-brand-dark underline">
          question bank
        </Link>
        .
      </p>
      <div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Question selection">
          {MODES.map((mode) => (
            <button
              key={mode.label}
              type="button"
              aria-pressed={focus === mode.focus}
              onClick={() => setFocus(mode.focus)}
              className={`rounded px-3 py-1 text-sm ${focus === mode.focus ? 'bg-brand text-chalk' : 'border border-slate-300 text-slate-700'}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{MODES.find((m) => m.focus === focus)!.hint}</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Mixed set</h2>
        <p className="mt-1 text-sm text-slate-600">
          Items from every domain, drawn by exam weight like the mock exam, but untimed and with the answer revealed after each item.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MIX_SIZES.map((n) =>
            ITEMS.length === 0 ? (
              <span key={n} className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-400">
                {n} questions
              </span>
            ) : (
              <Link key={n} to={withMode(`?mix=${n}`, focus)} className="rounded border border-brand px-3 py-1 text-sm text-brand-dark hover:bg-brand/10">
                {n} questions
              </Link>
            ),
          )}
        </div>
      </section>
      {DOMAINS.map((d) => {
        const tasks = tasksOf(d.id)
        return (
          <section key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">
              <PracticeLink to={withMode(`?domain=${d.id}`, focus)} count={count(tasks.map((t) => t.id))}>
                {d.id}. {d.title}
              </PracticeLink>
            </h2>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {tasks.map((t) => (
                <li key={t.id} className="text-sm">
                  <PracticeLink to={withMode(`?task=${t.id}`, focus)} count={count([t.id])}>
                    {t.id} {t.title}
                  </PracticeLink>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function withMode(search: string, focus: boolean) {
  return focus ? `${search}&focus=1` : search
}

function PracticeLink({ to, count, children }: { to: string; count: number; children: ReactNode }) {
  if (count === 0) {
    return (
      <span className="text-slate-400">
        {children} <span className="text-xs">(no questions yet)</span>
      </span>
    )
  }
  return (
    <Link to={to} className="text-brand-dark underline-offset-2 hover:underline">
      {children} <span className="text-xs text-slate-500">({count})</span>
    </Link>
  )
}

/** Runs `items` in the order given; callers decide how they are sampled and ordered. */
function PracticeSession({ items: initial, label, onAgain }: { items: Item[]; label: string; onAgain: () => void }) {
  const [items] = useState(initial)
  const [index, setIndex] = useState(0)
  const [response, setResponse] = useState<Response>([])
  const [revealed, setRevealed] = useState(false)
  const [answers, setAnswers] = useState<Record<string, Response>>({})
  const item = items[index]

  // Enter checks the answer, then moves on. Declared before the early returns below.
  useShortcuts({
    Enter: () => {
      if (!item) return
      if (revealed) next()
      else if (isAnswered(item, response)) check()
    },
  })

  if (items.length === 0) {
    return (
      <p>
        No questions for this selection yet.{' '}
        <Link to="/practice" className="underline">
          Back to practice
        </Link>
      </p>
    )
  }

  const answered = items.filter((i) => i.id in answers)
  const isRight = (i: Item) => grade(i, answers[i.id]!)
  const right = answered.filter(isRight).length

  if (!item) {
    const rows = taskRows(answered, isRight)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Session complete: {label}</h1>
        <p>
          {right} / {answered.length} correct.
        </p>
        {/* A single-task session would just repeat the total. */}
        {rows.length > 1 && <ScoreTable rows={rows} heading="Task" />}
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={onAgain} className="rounded bg-brand px-4 py-2 font-medium text-chalk">
            Practise again
          </button>
          <Link to="/practice" className="underline">
            Back to practice
          </Link>
        </div>
        <SessionReview items={items} answers={answers} />
      </div>
    )
  }

  function check() {
    recordAnswer(item!.id, grade(item!, response))
    setAnswers((a) => ({ ...a, [item!.id]: response }))
    setRevealed(true)
  }

  function next() {
    setIndex((i) => i + 1)
    setResponse([])
    setRevealed(false)
  }

  const correct = revealed && grade(item, response)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm text-slate-600">
        <span>{label}</span>
        <span>
          Question {index + 1} of {items.length} · {right}/{answered.length} correct
        </span>
      </div>
      <ItemView key={item.id} item={item} response={response} onChange={setResponse} revealed={revealed} keyboard />
      {revealed && (
        <p role="status" className={`text-lg font-semibold ${correct ? 'text-green-600' : 'text-red-600'}`}>
          {correct ? '✓ Correct' : '✗ Not quite'}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <ShortcutHint items={[['1–6', 'or A–F select'], ['Enter', revealed ? 'next' : 'check']]} />
        {revealed ? (
          <button onClick={next} className="rounded bg-brand px-4 py-2 font-medium text-chalk">
            {index + 1 === items.length ? 'Finish' : 'Next question'}
          </button>
        ) : (
          <button onClick={check} disabled={!isAnswered(item, response)} className="rounded bg-brand px-4 py-2 font-medium text-chalk disabled:opacity-40">
            Check answer
          </button>
        )}
      </div>
    </div>
  )
}
