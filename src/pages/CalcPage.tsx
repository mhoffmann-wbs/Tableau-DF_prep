import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CalcEditor, type CalcSheet, calcStatus } from '../build/CalcEditor'
import { OBJECTIVE_BY_ID } from '../content/blueprint'
import { CALC_EXERCISES, CALC_EXERCISE_BY_ID, type CalcExercise } from '../content/calc'
import { CALC_TODAY } from '../engine/calc'
import type { CheckResult, Preview } from '../engine/calc/runtime'
import { specHash } from '../engine/edit'
import { fieldsOf, SOURCE_INFO } from '../engine/model'
import { type Calc, SOURCES, type SourceId, vizSpecSchema } from '../engine/spec'
import { deleteCalc, recordCalcExercise, saveCalc, useProgress } from '../progress/store'

const card = 'rounded-lg border border-slate-200 bg-white p-3'
const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

type Loaded = { key: string } & ({ preview: Preview } | { error: string })

/** Runs a valid calc over the data (the dataset loads on first use) and shows the values it gives. */
function usePreview(sheet: CalcSheet, by: string[], valid: boolean) {
  const key = JSON.stringify([sheet, by])
  const [loaded, setLoaded] = useState<Loaded>()
  useEffect(() => {
    if (!valid) return
    let cancelled = false
    const [s, b] = JSON.parse(key) as [CalcSheet, string[]]
    import('../engine/calc/runtime')
      .then((m) => m.preview(s, b))
      .then((preview) => !cancelled && setLoaded({ key, preview }))
      .catch((e: unknown) => !cancelled && setLoaded({ key, error: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
    }
  }, [key, valid])
  return valid && loaded?.key === key ? loaded : undefined
}

function PreviewTable({ loaded, aggregate }: { loaded: Loaded | undefined; aggregate: boolean }) {
  if (!loaded) return <p className="text-sm text-slate-500">Running the calculation over the Driftlight data…</p>
  if ('error' in loaded)
    return (
      <p role="alert" className="text-sm text-red-700">
        {loaded.error}
      </p>
    )
  const { headers, rows, total, nulls } = loaded.preview
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-500">
        {aggregate
          ? `One value per mark: ${total.toLocaleString('en-US')} mark${total === 1 ? '' : 's'}${nulls ? `, ${nulls} of them Null` : ''}.`
          : `The first ${rows.length} of ${total.toLocaleString('en-US')} rows. ${nulls.toLocaleString('en-US')} row${nulls === 1 ? '' : 's'} give${nulls === 1 ? 's' : ''} Null.`}
      </p>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300">
              {headers.map((h, i) => (
                <th key={i} scope="col" className={`px-2 py-1 font-semibold whitespace-nowrap ${i === headers.length - 1 ? 'text-brand-dark' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                {r.map((v, j) => (
                  <td key={j} className={`px-2 py-0.5 whitespace-nowrap ${j === r.length - 1 ? 'font-mono font-semibold' : 'text-slate-600'}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CalcPage() {
  const { exerciseId } = useParams()
  if (exerciseId === undefined) return <FreePlayground />
  const exercise = CALC_EXERCISE_BY_ID.get(exerciseId)
  if (!exercise)
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Exercise not found</h1>
        <Link to="/build/calc" className="text-brand-dark underline">
          Calc playground
        </Link>
      </div>
    )
  // Keyed, so the next exercise starts with an empty formula and no feedback.
  return <ExercisePlayground key={exercise.id} exercise={exercise} />
}

/** The formulas from lesson 2.3, to start from. */
const EXAMPLES: (Calc & { source: SourceId })[] = [
  { source: 'sessions', name: 'Hours Watched', formula: '[Minutes Watched] / 60' },
  { source: 'subscribers', name: 'Location', formula: '[City] + ", " + [Country]' },
  { source: 'subscribers', name: 'Days to Cancel', formula: "DATEDIFF('day', [Signup Date], [Cancel Date])" },
  { source: 'sessions', name: 'Start Month', formula: "DATETRUNC('month', [Start])" },
  { source: 'sessions', name: 'Minutes per Session', formula: 'SUM([Minutes Watched]) / COUNT([Session ID])' },
  { source: 'sessions', name: 'Broken Ratio', formula: '[Minutes Watched] / COUNT([Session ID])' },
]

function FreePlayground() {
  const [source, setSource] = useState<SourceId>('sessions')
  const [name, setName] = useState('Calculation1')
  const [formula, setFormula] = useState('')
  const [by, setBy] = useState('')
  const [savedNote, setSavedNote] = useState<string>()
  const saved = useProgress().calcs.filter((c) => c.source === source)
  const others = saved.filter((c) => c.name !== name.trim()).map(({ name: n, formula: f }) => ({ name: n, formula: f }))
  const sheet: CalcSheet = { source, calcs: others }
  const status = calcStatus(sheet, name, formula)
  const valid = 'field' in status
  const aggregate = valid && status.field.calc!.compiled!.aggregate
  const current: Calc = { name: name.trim(), formula }
  const dimensions = fieldsOf({ source, calcs: [...others, current] }).filter((f) => f.role === 'dimension' && f.name !== current.name && !f.calc?.error)
  const byList = aggregate && by ? [by] : []
  const loaded = usePreview({ source, calcs: [...others, current] }, byList, valid && formula.trim() !== '')

  const load = (c: Calc & { source: SourceId }) => {
    setSource(c.source)
    setName(c.name)
    setFormula(c.formula)
    setBy('')
    setSavedNote(undefined)
  }
  const sandboxLink = () => {
    const isDimension = valid && status.field.role === 'dimension'
    const spec = vizSpecSchema.parse({
      source,
      calcs: [...others, current],
      ...(isDimension
        ? { rows: [{ field: current.name }], columns: [{ field: SOURCE_INFO[source].countField }] }
        : { columns: [{ field: current.name }], rows: byList.map((f) => ({ field: f })) }),
    })
    return `/build/sandbox${specHash(spec)}`
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Calc playground</h1>
      <p className="text-slate-600">
        Write a calculated field the way you would in Tableau’s calculation editor and see what it gives on the Driftlight data. The playground
        knows a subset of Tableau’s functions (open the list on the right) and reports errors the way Tableau does, including mixing aggregate
        and row-level values. <code>TODAY()</code> is fixed at {CALC_TODAY}.
      </p>
      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Data source
            <select
              className={inputClass}
              value={source}
              onChange={(e) => {
                setSource(e.target.value as SourceId)
                setBy('')
              }}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_INFO[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Start from an example
            <select
              className={inputClass}
              value=""
              onChange={(e) => {
                const ex = EXAMPLES[Number(e.target.value)]
                if (ex) load(ex)
              }}
            >
              <option value="">Choose…</option>
              {EXAMPLES.map((ex, i) => (
                <option key={ex.name} value={i}>
                  {ex.name}: {ex.formula}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CalcEditor
          sheet={sheet}
          name={name}
          onName={(n) => {
            setName(n)
            setSavedNote(undefined)
          }}
          formula={formula}
          onFormula={(f) => {
            setFormula(f)
            setSavedNote(undefined)
          }}
          footer={
            valid &&
            formula.trim() !== '' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  disabled={!current.name}
                  onClick={() => {
                    saveCalc({ source, ...current })
                    setSavedNote(`Saved ${current.name}. It’s in the Data pane of every ${SOURCE_INFO[source].label} sheet in the sandbox.`)
                  }}
                  className="rounded bg-brand px-3 py-1 text-chalk disabled:opacity-40"
                >
                  Save calculation
                </button>
                <Link to={sandboxLink()} className="rounded border border-slate-300 px-3 py-1">
                  Open in sandbox
                </Link>
                {savedNote && (
                  <span role="status" className="text-green-700">
                    {savedNote}
                  </span>
                )}
              </div>
            )
          }
        />
      </section>
      {valid && formula.trim() !== '' && (
        <section className={`${card} space-y-2`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Result</h2>
            {aggregate && (
              <label className="flex items-center gap-2 text-sm">
                Compute per
                <select className={inputClass} value={by} onChange={(e) => setBy(e.target.value)}>
                  <option value="">Nothing (the whole data source)</option>
                  {dimensions.map((d) => (
                    <option key={d.name}>{d.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <PreviewTable loaded={loaded} aggregate={aggregate} />
        </section>
      )}
      {saved.length > 0 && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">Saved calculations ({SOURCE_INFO[source].label})</h2>
          <p className="text-sm text-slate-600">Other formulas here can use them by name, and the sandbox lists them in its Data pane.</p>
          <ul className="space-y-1 text-sm">
            {saved.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <code className="text-xs text-slate-600">{c.formula}</code>
                <button type="button" onClick={() => load(c)} className="text-brand-dark underline">
                  Edit
                </button>
                <button type="button" onClick={() => deleteCalc(c.source, c.name)} className="text-brand-dark underline">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ExerciseList />
    </div>
  )
}

export function ExerciseList() {
  const solved = useProgress().calcExercises
  const done = CALC_EXERCISES.filter((e) => solved[e.id] !== undefined).length
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Calc exercises</h2>
      <p className="text-sm text-slate-600">
        Each exercise asks for one calculated field and checks it against the data: your formula passes when it gives the same values as the
        answer on every row (or for every mark, for aggregate calculations). {done} of {CALC_EXERCISES.length} solved. Exercises don’t count
        towards exam readiness.
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {CALC_EXERCISES.map((e, i) => (
          <li key={e.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <Link to={`/build/calc/${e.id}`} className="font-medium text-brand-dark underline">
              {i + 1}. {e.title}
            </Link>
            {solved[e.id] !== undefined && (
              <span className="ml-2 text-sm text-green-600" aria-label="solved">
                ✓
              </span>
            )}
            <p className="mt-0.5 text-xs text-slate-500">Objectives {e.objectives.join(', ')}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ExercisePlayground({ exercise }: { exercise: CalcExercise }) {
  const [formula, setFormula] = useState('')
  const [result, setResult] = useState<CheckResult & { formula: string }>()
  const [checking, setChecking] = useState(false)
  const [hintsShown, setHintsShown] = useState(0)
  const [answerShown, setAnswerShown] = useState(false)
  const solvedBefore = useProgress().calcExercises[exercise.id] !== undefined
  const sheet: CalcSheet = { source: exercise.source, calcs: [] }
  const status = calcStatus(sheet, exercise.name, formula)
  const valid = 'field' in status && formula.trim() !== ''
  const aggregate = 'field' in status && status.field.calc!.compiled!.aggregate
  const loaded = usePreview({ source: exercise.source, calcs: [{ name: exercise.name, formula }] }, aggregate ? exercise.by : [], valid)
  // Feedback belongs to the formula it was checked against; any edit clears it.
  const current = result?.formula === formula ? result : undefined
  const index = CALC_EXERCISES.indexOf(exercise)
  const next = CALC_EXERCISES[index + 1]

  const check = async () => {
    setChecking(true)
    try {
      const m = await import('../engine/calc/runtime')
      const r = await m.check({ source: exercise.source, calcs: [] }, formula, exercise.expected, exercise.by)
      setResult({ ...r, formula })
      if (r.ok) recordCalcExercise(exercise.id)
    } catch (e) {
      setResult({ ok: false, message: `The check couldn’t run: ${e instanceof Error ? e.message : String(e)}`, formula })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        <Link to="/build/calc" className="text-brand-dark underline">
          Calc playground
        </Link>{' '}
        › Exercise {index + 1} of {CALC_EXERCISES.length}
      </p>
      <h1 className="text-3xl font-bold">
        {exercise.title}
        {solvedBefore && <span className="ml-2 align-middle text-base font-normal text-green-600">✓ solved</span>}
      </h1>
      <p className="text-slate-700">{exercise.prompt}</p>
      <p className="text-sm text-slate-600">
        Data source: {SOURCE_INFO[exercise.source].label}. Fields to use: {exercise.fields.map((f) => `[${f}]`).join(', ')}.
      </p>
      <p className="text-xs text-slate-500">{exercise.objectives.map((o) => `${o} ${OBJECTIVE_BY_ID.get(o)?.text ?? ''}`).join(' · ')}</p>
      <section className={card}>
        <CalcEditor sheet={sheet} name={exercise.name} formula={formula} onFormula={setFormula} highlight={exercise.fields} />
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={check} disabled={formula.trim() === '' || checking} className="rounded bg-brand px-4 py-1.5 text-chalk disabled:opacity-40">
          {checking ? 'Checking…' : 'Check my formula'}
        </button>
        {exercise.hints.length > 0 && (
          <button
            type="button"
            disabled={hintsShown === exercise.hints.length}
            onClick={() => setHintsShown((n) => n + 1)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Show a hint ({hintsShown} of {exercise.hints.length})
          </button>
        )}
        <button type="button" onClick={() => setAnswerShown(true)} disabled={answerShown} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">
          Show an answer
        </button>
      </div>
      {hintsShown > 0 && (
        <ul className="list-disc space-y-1 pl-6 text-sm text-slate-700">
          {exercise.hints.slice(0, hintsShown).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {answerShown && (
        <p className="text-sm">
          One answer: <code className="rounded bg-slate-100 px-1">{exercise.expected}</code>
        </p>
      )}
      {current && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${current.ok ? 'border-green-600 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
          {current.ok ? (
            <>
              <p className="font-semibold">That’s right: your formula gives the same values as the answer.</p>
              <p className="mt-1">{exercise.debrief}</p>
              <p className="mt-2">
                {next ? (
                  <Link to={`/build/calc/${next.id}`} className="text-brand-dark underline">
                    Next exercise: {next.title}
                  </Link>
                ) : (
                  <Link to="/build/calc" className="text-brand-dark underline">
                    Back to the playground
                  </Link>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Not quite yet.</p>
              <p className="mt-1">{current.message}</p>
            </>
          )}
        </div>
      )}
      {valid && (
        <section className={`${card} space-y-2`}>
          <h2 className="font-semibold">What your formula gives{aggregate && exercise.by.length > 0 ? ` per ${exercise.by.join(' and ')}` : ''}</h2>
          <PreviewTable loaded={loaded} aggregate={aggregate} />
        </section>
      )}
    </div>
  )
}
