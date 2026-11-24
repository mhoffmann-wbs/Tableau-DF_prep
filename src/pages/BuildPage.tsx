import { useState } from 'react'
import { Link } from 'react-router'
import { CALC_EXERCISES } from '../content/calc'
import { FLASHCARDS } from '../content/flashcards'
import { SIMS } from '../content/sims'
import { deckStats } from '../flashcards/leitner'
import { SANDBOX_CHALLENGES } from '../content/sandbox'
import { useProgress } from '../progress/store'

export default function BuildPage() {
  const { sandbox: solved, calcExercises, flashcards } = useProgress()
  const [now] = useState(Date.now)
  const cards = deckStats(
    FLASHCARDS.map((c) => c.id),
    flashcards,
    now,
  )
  const calcsDone = CALC_EXERCISES.filter((e) => calcExercises[e.id] !== undefined).length
  const done = SANDBOX_CHALLENGES.filter((c) => solved[c.id] !== undefined).length
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Build</h1>
      <p className="text-slate-600">
        The exam has no hands-on items, but it asks what a view shows and how to build it. Practise that here with the Driftlight data, no
        Tableau licence needed.
      </p>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">
          <Link to="/build/sandbox" className="text-brand-dark underline">
            Viz builder sandbox
          </Link>
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          A schematic Tableau-style worksheet: a Data pane, the Filters shelf, the Marks card, Columns and Rows, and pills that turn blue or
          green. Build anything you like.
        </p>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">
          <Link to="/build/calc" className="text-brand-dark underline">
            Calc playground
          </Link>
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Write calculated fields (string, date, arithmetic, logic and aggregate formulas), see their values on the Driftlight data and learn
          Tableau’s errors, such as mixing aggregate and row-level values. {CALC_EXERCISES.length} exercises, {calcsDone} solved. Saved
          calculations show up in the sandbox’s Data pane.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Concept simulators</h2>
        <p className="text-sm text-slate-600">Change one thing and watch what Tableau does. Each ends with a few exam questions.</p>
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
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">
          <Link to="/build/flashcards" className="text-brand-dark underline">
            Flashcards
          </Link>
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {FLASHCARDS.length} cards on terms, menu paths, file types, chart recipes and the blue/green rules, reviewed in Leitner boxes:{' '}
          {cards.due} due, {cards.fresh} new. Make and share your own decks too.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Make this chart</h2>
        <p className="text-sm text-slate-600">
          Each challenge shows a target chart; rebuild it in the sandbox and check it. {done} of {SANDBOX_CHALLENGES.length} solved. Challenges
          don’t count towards exam readiness.
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
      </section>
    </div>
  )
}
