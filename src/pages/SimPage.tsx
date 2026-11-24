import { Suspense, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Inline } from '../components/Inline'
import { ITEMS } from '../content/bank'
import { OBJECTIVE_BY_ID } from '../content/blueprint'
import type { Item } from '../content/schema'
import { SIM_BY_ID } from '../content/sims'
import { recordAnswer } from '../progress/store'
import { grade, isAnswered, type Response } from '../quiz/grade'
import { ItemView } from '../quiz/ItemView'
import { SIM_COMPONENTS } from '../sims'

export default function SimPage() {
  const { simId = '' } = useParams()
  const sim = SIM_BY_ID.get(simId)
  const entry = SIM_COMPONENTS[simId]
  if (!sim || !entry)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Simulator not found</h1>
        <Link to="/build" className="text-brand-dark underline">
          Back to Build
        </Link>
      </div>
    )
  const Component = entry.component
  const tasks = [...new Set(sim.objectives.map((o) => o.split('.').slice(0, 2).join('.')))]
  const items = sim.items.map((id) => ITEMS.find((i) => i.id === id)!)
  return (
    <div className="space-y-6">
      <Link to="/build" className="text-sm text-slate-600 hover:underline">
        ← Build
      </Link>
      <h1 className="text-3xl font-bold">{sim.title}</h1>
      <p className="text-slate-600">
        <Inline text={sim.intro} />
      </p>
      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer">Objectives {sim.objectives.join(', ')}</summary>
        <ul className="mt-1 list-disc pl-5">
          {sim.objectives.map((o) => (
            <li key={o}>
              {o} {OBJECTIVE_BY_ID.get(o)?.text}
            </li>
          ))}
        </ul>
      </details>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading the simulator…</p>}>
        <Component copy={sim.copy} />
      </Suspense>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Check yourself</h2>
        {items.map((item) => (
          <CheckItem key={item.id} item={item} />
        ))}
        <p className="text-sm">
          Read more:{' '}
          {tasks.map((t, i) => (
            <span key={t}>
              {i > 0 && ', '}
              <Link to={`/learn/${t}`} className="text-brand-dark underline">
                lesson {t}
              </Link>
            </span>
          ))}
        </p>
      </section>
    </div>
  )
}

/** A bank item answered in place; the answer counts like any practice answer. */
function CheckItem({ item }: { item: Item }) {
  const [response, setResponse] = useState<Response>([])
  const [revealed, setRevealed] = useState(false)
  const correct = revealed && grade(item, response)
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <ItemView item={item} response={response} onChange={setResponse} revealed={revealed} showTask={false} />
      {revealed ? (
        <p role="status" className={`font-semibold ${correct ? 'text-green-600' : 'text-red-600'}`}>
          {correct ? '✓ Correct' : '✗ Not quite'}
        </p>
      ) : (
        <button
          onClick={() => {
            recordAnswer(item.id, grade(item, response))
            setRevealed(true)
          }}
          disabled={!isAnswered(item, response)}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-chalk disabled:opacity-40"
        >
          Check answer
        </button>
      )}
    </div>
  )
}
