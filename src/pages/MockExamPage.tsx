import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EXAM_FORMAT, allocateMock } from '../content/blueprint'
import { ITEMS } from '../content/bank'
import type { Item } from '../content/schema'
import { sessionRng } from '../data/rng'
import { getProgress, recordAnswer, recordMockResult } from '../progress/store'
import { type Response, grade, isAnswered } from '../quiz/grade'
import { ItemView } from '../quiz/ItemView'
import { type MockScore, scoreMock } from '../quiz/results'
import { type MockExam, buildMockExam } from '../quiz/sampler'
import { ScoreTable } from '../quiz/ScoreTable'
import { ShortcutHint } from '../quiz/ShortcutHint'
import { useShortcuts } from '../quiz/shortcuts'

type Answers = Record<string, Response>

/** Items the learner has answered before, so a new mock prefers fresh ones. */
const seenBefore = () => new Set(Object.entries(getProgress().items).flatMap(([id, s]) => (s.attempts > 0 ? [id] : [])))

const newExam = (): MockExam => buildMockExam(ITEMS, seenBefore(), sessionRng())

export default function MockExamPage() {
  const [exam, setExam] = useState<MockExam | null>(null)
  const [result, setResult] = useState<{ score: MockScore; answers: Answers } | null>(null)
  // Keys the runner so a new exam starts with a fresh clock, answers and flags.
  const [attempt, setAttempt] = useState(0)

  function start() {
    setExam(newExam())
    setResult(null)
    setAttempt((a) => a + 1)
  }

  if (result && exam) return <MockResults exam={exam} score={result.score} answers={result.answers} onRestart={start} />
  if (exam) {
    return (
      <MockRunner
        key={attempt}
        exam={exam}
        onSubmit={(answers) => {
          const isRight = (item: Item) => !!answers[item.id] && grade(item, answers[item.id]!)
          const score = scoreMock(exam.items, isRight)
          const at = Date.now()
          for (const item of exam.items) recordAnswer(item.id, isRight(item), at)
          const record = ({ id, correct, total }: { id: string; correct: number; total: number }) => ({ id, correct, total })
          recordMockResult({
            at,
            correct: score.correct,
            total: score.total,
            percent: score.percent,
            passed: score.passed,
            domains: score.domains.map(record),
            tasks: score.tasks.map(record),
          })
          setResult({ score, answers })
        }}
      />
    )
  }
  return <MockIntro onStart={start} />
}

function MockIntro({ onStart }: { onStart: () => void }) {
  const [preview] = useState(newExam)
  const split = [...allocateMock().values()].join(' · ')
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Mock exam</h1>
      <p>
        The real exam has {EXAM_FORMAT.items} scored questions (plus up to {EXAM_FORMAT.unscoredMax} unscored ones) in {EXAM_FORMAT.minutes}{' '}
        minutes, and you need {EXAM_FORMAT.passPercent}% to pass. This mock draws {EXAM_FORMAT.items} questions by domain weight ({split}),
        all scored. There is no feedback until you submit, and you can flag questions and review them before submitting.
      </p>
      <p className="text-sm text-slate-600">
        Want a mixed set without the clock and with feedback after every question? Run a{' '}
        <Link to="/practice" className="text-brand-dark underline">
          mixed set
        </Link>{' '}
        on the Practice page.
      </p>
      {preview.shortfall > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {preview.items.length === 0 ? (
            'The question bank is still being written, so there are no questions for a mock yet.'
          ) : (
            <>
              The question bank is still growing. This mock has <strong>{preview.items.length}</strong> questions, and its time limit is
              scaled to the real exam's pace: <strong>{preview.minutes} min</strong>.
            </>
          )}
        </p>
      )}
      <button onClick={onStart} disabled={preview.items.length === 0} className="rounded bg-brand px-5 py-2 font-medium text-chalk disabled:opacity-40">
        Start the mock exam
      </button>
    </div>
  )
}

function MockRunner({ exam, onSubmit }: { exam: MockExam; onSubmit: (answers: Answers) => void }) {
  const [deadline] = useState(() => Date.now() + exam.minutes * 60_000)
  const [now, setNow] = useState(() => Date.now())
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [reviewing, setReviewing] = useState(false)
  // Once the review screen has been reached, items offer a way straight back to it.
  const [reviewed, setReviewed] = useState(false)

  const submit = useCallback(() => onSubmit(answers), [answers, onSubmit])
  const remaining = Math.max(0, deadline - now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (remaining === 0) submit()
  }, [remaining, submit])

  const item = exam.items[index]!
  const answered = (i: Item) => isAnswered(i, answers[i.id] ?? [])
  const unanswered = exam.items.filter((i) => !answered(i)).length

  function toggleFlag(id: string) {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isLast = index + 1 === exam.items.length
  const openReview = () => {
    setReviewing(true)
    setReviewed(true)
  }
  const goNext = () => (isLast ? openReview() : setIndex((i) => i + 1))
  // M for "mark": F is an answer letter on six-option items.
  useShortcuts(
    {
      Enter: goNext,
      ArrowRight: goNext,
      ArrowLeft: () => setIndex((i) => Math.max(0, i - 1)),
      m: () => toggleFlag(item.id),
      ...(reviewed && { r: openReview }),
    },
    !reviewing,
  )

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded bg-header px-4 py-2 text-chalk">
        <span>{reviewing ? 'Review' : `Question ${index + 1} of ${exam.items.length}`}</span>
        <span className="font-mono" aria-label="time remaining">
          {formatClock(remaining)}
        </span>
      </div>

      {reviewing ? (
        <div className="space-y-4">
          <p>
            {unanswered === 0 ? 'All questions answered.' : `${unanswered} question(s) unanswered.`} {flagged.size} flagged.
          </p>
          <ol className="grid grid-cols-6 gap-2 sm:grid-cols-10">
            {exam.items.map((i, n) => (
              <li key={i.id}>
                <button
                  onClick={() => {
                    setIndex(n)
                    setReviewing(false)
                  }}
                  className={`w-full rounded border px-2 py-1 text-sm ${answered(i) ? 'border-brand bg-brand/10' : 'border-slate-300 bg-white'} ${
                    flagged.has(i.id) ? 'ring-2 ring-accent' : ''
                  }`}
                >
                  {n + 1}
                  {flagged.has(i.id) ? ' ⚑' : ''}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex justify-between">
            <button onClick={() => setReviewing(false)} className="rounded border px-4 py-2">
              Back to questions
            </button>
            <button onClick={submit} className="rounded bg-brand-dark px-4 py-2 font-medium text-chalk">
              Submit exam
            </button>
          </div>
        </div>
      ) : (
        <>
          <ItemView
            key={item.id}
            item={item}
            response={answers[item.id] ?? []}
            onChange={(r) => setAnswers((a) => ({ ...a, [item.id]: r }))}
            keyboard
            showTask={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setIndex((i) => i - 1)} disabled={index === 0} className="rounded border px-4 py-2 disabled:opacity-40">
              Previous
            </button>
            <button onClick={() => toggleFlag(item.id)} className="rounded border px-4 py-2">
              {flagged.has(item.id) ? 'Unflag' : 'Flag for review'}
            </button>
            {reviewed && (
              <button onClick={openReview} className="rounded border px-4 py-2">
                Back to review
              </button>
            )}
            <button onClick={goNext} className="rounded bg-brand px-4 py-2 text-chalk">
              {isLast ? 'Review' : 'Next'}
            </button>
          </div>
          <ShortcutHint
            items={[
              ['1–6', 'or A–F select'],
              ['Enter', isLast ? 'review' : 'next'],
              ['← →', 'move'],
              ['M', 'flag'],
              ...(reviewed ? [['R', 'review'] satisfies [string, string]] : []),
            ]}
          />
        </>
      )}
    </div>
  )
}

function MockResults({ exam, score, answers, onRestart }: { exam: MockExam; score: MockScore; answers: Answers; onRestart: () => void }) {
  const [showReview, setShowReview] = useState(false)
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">{score.passed ? 'Pass' : 'Not yet: keep practising'}</h1>
        <p className="text-lg">
          <strong>{score.percent}%</strong> ({score.correct}/{score.total} correct) · pass at {EXAM_FORMAT.passPercent}%
        </p>
        <p className="text-xs text-slate-500">
          Every question here is scored all or nothing.
          {exam.shortfall > 0 && ` This mock had ${exam.shortfall} fewer questions than the real exam.`}
        </p>
        <ScoreTable rows={score.domains} heading="Domain" />
        <details>
          <summary className="cursor-pointer text-sm text-brand-dark">By task</summary>
          <div className="mt-2">
            <ScoreTable rows={score.tasks} heading="Task" />
          </div>
        </details>
      </section>
      <div className="flex gap-3">
        <button onClick={() => setShowReview((v) => !v)} className="rounded border px-4 py-2">
          {showReview ? 'Hide answers' : 'Review answers'}
        </button>
        <button onClick={onRestart} className="rounded bg-brand px-4 py-2 text-chalk">
          Start a new mock exam
        </button>
      </div>
      {showReview &&
        exam.items.map((item, n) => (
          <section key={item.id} className="border-t border-slate-200 pt-6">
            <p className="mb-2 text-sm text-slate-500">Question {n + 1}</p>
            <ItemView item={item} response={answers[item.id] ?? []} onChange={() => {}} revealed />
          </section>
        ))}
    </div>
  )
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
