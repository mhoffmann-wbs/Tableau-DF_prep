import { useEffect, useState } from 'react'
import { AGG_LABEL } from '../engine/pills'
import type { QueryResult } from '../engine/query'
import { Shelves } from '../engine/Shelves'
import { type Aggregation, type Pill, type VizSpec, vizSpecSchema } from '../engine/spec'
import { Viz } from '../engine/Viz'
import { Inline } from '../components/Inline'
import type { SimProps } from '.'
import { Choice } from './Choice'

export const COPY_KEYS = ['none', 'headers', 'color', 'detail', 'marks', 'additive', 'nonAdditive', 'sql'] as const

/** The dimensions the slider adds, in order, each on its own shelf. */
export const STEPS = [
  { field: 'Plan', shelf: 'Columns', note: 'headers' },
  { field: 'Device', shelf: 'Color', note: 'color' },
  { field: 'Region', shelf: 'Rows', note: 'headers' },
  { field: 'Country', shelf: 'Detail', note: 'detail' },
] as const
export const AGGS: Aggregation[] = ['sum', 'avg', 'median', 'max']

/** The view with the first `step` dimensions of STEPS and the measure under `agg`. */
export function granularitySpec(step: number, agg: Aggregation): VizSpec {
  const on = (shelf: string) => STEPS.slice(0, step).filter((s) => s.shelf === shelf).map((s): Pill => ({ field: s.field }))
  return vizSpecSchema.parse({
    columns: on('Columns'),
    rows: [...on('Rows'), { field: 'Minutes Watched', agg }],
    marks: { type: 'bar', color: on('Color')[0], detail: on('Detail') },
  })
}

export interface GranularityStats {
  marks: number
  /** Members of each dimension in the view; their product bounds the marks. */
  members: [field: string, count: number][]
  /** The marks' values added up, and the measure over all rows (one group). */
  sumOfMarks: number
  overall: number
}

export function granularityStats(result: QueryResult, whole: QueryResult): GranularityStats {
  const measure = result.columns.find((c) => c.kind === 'measure')!
  const members = result.columns.filter((c) => c.kind === 'dimension').map((c): [string, number] => [c.field.name, c.order?.length ?? 0])
  const sumOfMarks = result.rows.reduce((s, r) => s + (Number(r[measure.id]) || 0), 0)
  const wholeMeasure = whole.columns.find((c) => c.kind === 'measure')!
  return { marks: result.rows.length, members, sumOfMarks, overall: Number(whole.rows[0]?.[wholeMeasure.id] ?? 0) }
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

/** A slider that adds dimensions one by one to a view of Minutes Watched, with the marks and totals it gives. */
export default function Granularity({ copy }: SimProps) {
  const [step, setStep] = useState(0)
  const [agg, setAgg] = useState<Aggregation>('sum')
  const spec = granularitySpec(step, agg)
  const stats = useStats(spec, granularitySpec(0, agg))
  const label = `${AGG_LABEL[agg]}(Minutes Watched)`
  const latest = STEPS[step - 1]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Dimensions in the view: {step}</span>
          <input
            type="range"
            min={0}
            max={STEPS.length}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className="mt-2 block w-full accent-brand"
            aria-valuetext={step === 0 ? 'none' : STEPS.slice(0, step).map((s) => s.field).join(', ')}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {STEPS.map((s, i) => (
              <span key={s.field} className={i < step ? 'font-semibold text-slate-700' : ''}>
                {i > 0 && ' → '}
                {s.field} on {s.shelf}
              </span>
            ))}
          </span>
        </label>
        <Choice label="Aggregation" value={agg} options={AGGS.map((a) => [a, AGG_LABEL[a]])} onChange={setAgg} />
      </div>
      <Shelves spec={spec} />
      <ul className="space-y-1 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm" aria-live="polite">
        <li>{latest ? copy[latest.note] : copy.none}</li>
        {stats ? (
          <>
            <li>
              <strong>
                {stats.marks.toLocaleString('en-US')} mark{stats.marks === 1 ? '' : 's'}
              </strong>
              {stats.members.length > 0 && (
                <>
                  , at most {stats.members.map(([f, n]) => `${n} ${f}`).join(' × ')} ={' '}
                  {stats.members.reduce((p, [, n]) => p * n, 1).toLocaleString('en-US')} member combinations.
                </>
              )}{' '}
              {step > 0 && copy.marks}
            </li>
            {step > 0 && (
              <li>
                The marks’ values add up to <strong>{fmt(stats.sumOfMarks)}</strong>; {label} over all sessions is <strong>{fmt(stats.overall)}</strong>.{' '}
                {agg === 'sum' ? copy.additive : copy.nonAdditive}
              </li>
            )}
          </>
        ) : (
          <li className="text-slate-500">Counting the marks…</li>
        )}
      </ul>
      <Viz spec={spec} title={`${label} by ${step === 0 ? 'nothing' : STEPS.slice(0, step).map((s) => s.field).join(', ')}`} />
      <p className="text-sm text-slate-600">
        <Inline text={copy.sql!} />
      </p>
    </div>
  )
}

/** Runs the view and the one-group view over the data (the engine loads on first use). */
function useStats(spec: VizSpec, whole: VizSpec) {
  const key = JSON.stringify([spec, whole])
  const [loaded, setLoaded] = useState<{ key: string; stats: GranularityStats }>()
  useEffect(() => {
    let cancelled = false
    const [s, w] = JSON.parse(key) as [VizSpec, VizSpec]
    import('../engine/runtime')
      .then((m) => Promise.all([m.runQuery(s), m.runQuery(w)]))
      .then(([r, all]) => !cancelled && setLoaded({ key, stats: granularityStats(r, all) }))
    return () => {
      cancelled = true
    }
  }, [key])
  return loaded?.key === key ? loaded.stats : undefined
}
