import { Link } from 'react-router'
import { DOMAINS, EXAM_FORMAT, allocateMock, tasksOf } from '../content/blueprint'

const mock = allocateMock()

const PILLARS = [
  { to: '/learn', title: 'Learn', text: 'One lesson per exam task, written for people new to Tableau, all on the data of one streaming service, Driftlight.' },
  { to: '/practice', title: 'Check', text: 'Practice questions in the exam’s style with full explanations, a timed mock exam and spaced-review flashcards.' },
  { to: '/build', title: 'Build', text: 'A viz builder sandbox, a calculated-field playground, concept simulators and challenges you build in Tableau Public.' },
]

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">{EXAM_FORMAT.name}</h1>
        <p className="text-lg text-slate-700">
          A free self-study course for the exam: {EXAM_FORMAT.items} questions in {EXAM_FORMAT.minutes} minutes,{' '}
          {EXAM_FORMAT.passPercent}% to pass, on Tableau {EXAM_FORMAT.productVersion}.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <Link key={p.to} to={p.to} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand">
            <h2 className="text-lg font-semibold text-brand-dark">{p.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{p.text}</p>
          </Link>
        ))}
      </section>
      <p className="text-sm text-slate-600">
        Before the exam: the printable{' '}
        <Link to="/guides/cheat-sheet" className="text-brand-dark underline">
          cheat sheet
        </Link>{' '}
        and the{' '}
        <Link to="/guides/exam-day" className="text-brand-dark underline">
          exam-day guide
        </Link>
        .
      </p>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The exam outline</h2>
        <p className="text-sm text-slate-600">
          Weights are percent of scored content; question counts are this app’s {EXAM_FORMAT.items}-question mock exam.{' '}
          <a href={EXAM_FORMAT.guideUrl} className="underline">
            Official exam guide
          </a>
        </p>
        {DOMAINS.map((d) => (
          <details key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <summary className="flex cursor-pointer justify-between gap-4 font-semibold">
              <span>
                {d.id}. {d.title}
              </span>
              <span className="shrink-0 font-normal text-slate-500">
                {d.weight}% · {mock.get(d.id)} questions
              </span>
            </summary>
            {tasksOf(d.id).map((t) => (
              <div key={t.id} className="mt-3">
                <Link to={`/learn/${t.id}`} className="font-medium text-brand-dark hover:underline">
                  {t.id} {t.title}
                </Link>
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
          </details>
        ))}
      </section>
    </div>
  )
}
