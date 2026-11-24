import { Link } from 'react-router'
import { DOMAINS, EXAM_FORMAT, LESSON_ORDER, TASK_BY_ID, allocateMock, tasksOf } from '../content/blueprint'

const mock = allocateMock()

const FACTS: [string, string][] = [
  ['Questions', `${EXAM_FORMAT.items} multiple-choice/multiple-select, plus up to ${EXAM_FORMAT.unscoredMax} unscored`],
  ['Time', `${EXAM_FORMAT.minutes} minutes`],
  ['Passing score', `${EXAM_FORMAT.passPercent}%`],
  ['Product version', `Tableau ${EXAM_FORMAT.productVersion}`],
  ['Fee', `US$${EXAM_FORMAT.feeUsd}, retake ${EXAM_FORMAT.retakeFee.toLowerCase()}`],
  ['Prerequisite', EXAM_FORMAT.prerequisite],
]

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{EXAM_FORMAT.name}</h1>
        <p className="max-w-3xl text-slate-600">
          A free self-study app: lessons for every task in the exam guide, practice questions in the exam's style, a timed mock exam, and
          hands-on tools — a viz builder, a calculated-field playground and challenges you build in Tableau Public — all using the data of
          an invented streaming service, Driftlight.
        </p>
        <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
          {FACTS.map(([term, value]) => (
            <div key={term} className="flex gap-2">
              <dt className="w-32 shrink-0 font-medium text-slate-500">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-slate-500">
          Source:{' '}
          <a className="text-brand-dark underline" href={EXAM_FORMAT.guideUrl}>
            the official exam guide
          </a>
          . Before the exam, read the{' '}
          <Link to="/guides/exam-day" className="text-brand-dark underline">
            exam-day guide
          </Link>{' '}
          and the{' '}
          <Link to="/guides/cheat-sheet" className="text-brand-dark underline">
            cheat sheet
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Lessons in learning order</h2>
        <p className="max-w-3xl text-slate-600">The concepts of domain 4 come first, because every other task builds on them.</p>
        <ol className="grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
          {LESSON_ORDER.map((id, i) => (
            <li key={id} className="flex gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-slate-400">{i + 1}</span>
              <Link to={`/learn/${id}`} className="text-brand-dark hover:underline">
                {id} {TASK_BY_ID.get(id)!.title}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Exam outline</h2>
        {DOMAINS.map((d) => (
          <article key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="flex flex-wrap items-baseline justify-between gap-2 text-lg font-semibold">
              <span>
                {d.id}. {d.title}
              </span>
              <span className="text-sm font-normal text-slate-500">
                {d.weight}% · {mock.get(d.id)} of {EXAM_FORMAT.items} mock items
              </span>
            </h3>
            {tasksOf(d.id).map((t) => (
              <div key={t.id} className="mt-3">
                <h4 className="font-medium">
                  {t.id} {t.title}
                </h4>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                  {t.objectives.map((o) => (
                    <li key={o.id}>
                      <span className="mr-2 font-mono text-xs text-slate-400">{o.id}</span>
                      {o.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        ))}
      </section>
    </div>
  )
}
