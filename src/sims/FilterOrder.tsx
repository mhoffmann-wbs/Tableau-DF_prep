import { useState } from 'react'
import { Inline } from '../components/Inline'
import type { SimProps } from '.'
import { Choice } from './Choice'

export const COPY_KEYS = [
  'sample',
  'order',
  'extract',
  'source',
  'context',
  'dimension',
  'measure',
  'tableCalc',
  'topWithout',
  'topWith',
  'topOff',
  'trap',
] as const

/** An invented sample row (not the real Driftlight data). `date` is ISO, so strings compare in date order. */
export interface Row {
  id: number
  title: string
  genre: string
  country: string
  device: string
  date: string
  minutes: number
}

export const ROWS: Row[] = [
  { id: 1, title: 'Night Harbor', genre: 'Drama', country: 'US', device: 'TV', date: '2025-01-15', minutes: 300 },
  { id: 2, title: 'Night Harbor', genre: 'Drama', country: 'DE', device: 'TV', date: '2025-02-15', minutes: 40 },
  { id: 3, title: 'Paper Moons', genre: 'Comedy', country: 'US', device: 'TV', date: '2025-02-15', minutes: 250 },
  { id: 4, title: 'Paper Moons', genre: 'Comedy', country: 'US', device: 'Mobile', date: '2025-05-15', minutes: 150 },
  { id: 5, title: 'Glass City', genre: 'Thriller', country: 'US', device: 'TV', date: '2025-03-15', minutes: 280 },
  { id: 6, title: 'Glass City', genre: 'Thriller', country: 'DE', device: 'Mobile', date: '2025-06-15', minutes: 30 },
  { id: 7, title: 'Slow Tides', genre: 'Documentary', country: 'DE', device: 'TV', date: '2025-01-15', minutes: 90 },
  { id: 8, title: 'Slow Tides', genre: 'Documentary', country: 'DE', device: 'Mobile', date: '2025-04-15', minutes: 80 },
  { id: 9, title: 'Quiet Fox', genre: 'Comedy', country: 'DE', device: 'TV', date: '2025-03-15', minutes: 70 },
  { id: 10, title: 'Quiet Fox', genre: 'Comedy', country: 'DE', device: 'Web', date: '2025-02-15', minutes: 60 },
  { id: 11, title: 'Red Signal', genre: 'Thriller', country: 'DE', device: 'Mobile', date: '2025-05-15', minutes: 50 },
  { id: 12, title: 'Red Signal', genre: 'Thriller', country: 'FR', device: 'Web', date: '2025-02-15', minutes: 20 },
]

export const TOP_N = 3
export const MEASURE_MIN = 100
export const COUNTRY = 'DE'
export const DATE_FROM = '2025-01-01'
export const DATE_TO = '2025-03-31'

export type StageKey = 'extract' | 'source' | 'context' | 'dimension' | 'measure'
export const STAGES: { key: StageKey; name: string }[] = [
  { key: 'extract', name: '1. Extract filters' },
  { key: 'source', name: '2. Data source filters' },
  { key: 'context', name: '3. Context filters' },
  { key: 'dimension', name: '4. Filters on dimensions' },
  { key: 'measure', name: '5. Filters on measures' },
]

export type FilterId = 'extract' | 'source' | 'country' | 'date' | 'top' | 'measure'
export interface Settings {
  on: Record<FilterId, boolean>
  /** Filters that can be added to context. */
  context: { country: boolean; date: boolean }
}

export const FILTERS: { id: FilterId; label: string; rule: string }[] = [
  { id: 'extract', label: 'Extract filter', rule: 'Device is not Web' },
  { id: 'source', label: 'Data source filter', rule: 'Genre is not Documentary' },
  { id: 'country', label: 'Dimension filter on Country', rule: `Country is ${COUNTRY}` },
  { id: 'date', label: 'Date filter on Start (range of dates)', rule: `Start from ${DATE_FROM} to ${DATE_TO}` },
  { id: 'top', label: 'Top N dimension filter on Title', rule: `Top ${TOP_N} by SUM(Minutes)` },
  { id: 'measure', label: 'Measure filter', rule: `SUM(Minutes) at least ${MEASURE_MIN}` },
]

export const DEFAULTS: Settings = {
  on: { extract: false, source: false, country: true, date: false, top: true, measure: false },
  context: { country: false, date: false },
}

export interface Mark {
  title: string
  minutes: number
}
export interface Stage {
  key: StageKey
  /** The rules that ran in this stage. */
  rules: string[]
  /** Rows entering and leaving the stage. */
  before: number
  after: number
}
export interface PipelineResult {
  stages: Stage[]
  /** Per row id: the stage that removed it, or null if it survives. */
  removedAt: Record<number, StageKey | null>
  /** The titles the Top N picked (among the rows it was computed over), if it is on. */
  topPicked: string[] | undefined
  /** The final marks, highest first. */
  marks: Mark[]
}

const isoOk = (r: Row) => r.date >= DATE_FROM && r.date <= DATE_TO
const countryOk = (r: Row) => r.country === COUNTRY

export function totalsByTitle(rows: Row[]): Mark[] {
  const sums = new Map<string, number>()
  for (const r of rows) sums.set(r.title, (sums.get(r.title) ?? 0) + r.minutes)
  return [...sums].map(([title, minutes]) => ({ title, minutes })).sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title))
}

/** The top `n` titles by summed minutes over `rows`. */
export function topTitles(rows: Row[], n = TOP_N): string[] {
  return totalsByTitle(rows)
    .slice(0, n)
    .map((m) => m.title)
}

/**
 * Runs the filters in Tableau's order: extract, data source, context, dimension, measure.
 * Context filters run before the dimension stage. In the dimension stage each filter, the Top N
 * included, is computed over the rows that reached the stage, so they do not see each other.
 */
export function runPipeline(settings: Settings, rows: Row[] = ROWS): PipelineResult {
  const { on, context } = settings
  const removedAt: Record<number, StageKey | null> = Object.fromEntries(rows.map((r) => [r.id, null]))
  const stages: Stage[] = []
  let live = rows
  let topPicked: string[] | undefined

  const run = (key: StageKey, rules: string[], keep: (rows: Row[]) => Row[]) => {
    const kept = new Set(keep(live).map((r) => r.id))
    for (const r of live) if (!kept.has(r.id)) removedAt[r.id] = key
    stages.push({ key, rules, before: live.length, after: kept.size })
    live = live.filter((r) => kept.has(r.id))
  }
  const rule = (id: FilterId) => FILTERS.find((f) => f.id === id)!.rule

  run('extract', on.extract ? [rule('extract')] : [], (rs) => (on.extract ? rs.filter((r) => r.device !== 'Web') : rs))
  run('source', on.source ? [rule('source')] : [], (rs) => (on.source ? rs.filter((r) => r.genre !== 'Documentary') : rs))

  const ctxCountry = on.country && context.country
  const ctxDate = on.date && context.date
  run('context', [ctxCountry && rule('country'), ctxDate && rule('date')].filter((x): x is string => !!x), (rs) =>
    rs.filter((r) => (!ctxCountry || countryOk(r)) && (!ctxDate || isoOk(r))),
  )

  const dimCountry = on.country && !context.country
  const dimDate = on.date && !context.date
  run('dimension', [dimCountry && rule('country'), dimDate && rule('date'), on.top && rule('top')].filter((x): x is string => !!x), (rs) => {
    if (on.top) topPicked = topTitles(rs)
    const top = new Set(topPicked)
    return rs.filter((r) => (!dimCountry || countryOk(r)) && (!dimDate || isoOk(r)) && (!on.top || top.has(r.title)))
  })

  run('measure', on.measure ? [rule('measure')] : [], (rs) => {
    if (!on.measure) return rs
    const keep = new Set(totalsByTitle(rs).filter((m) => m.minutes >= MEASURE_MIN).map((m) => m.title))
    return rs.filter((r) => keep.has(r.title))
  })

  return { stages, removedAt, topPicked, marks: totalsByTitle(live) }
}

const STAGE_COPY: Record<StageKey, (typeof COPY_KEYS)[number]> = {
  extract: 'extract',
  source: 'source',
  context: 'context',
  dimension: 'dimension',
  measure: 'measure',
}

const removedLabel = (k: StageKey | null) => (k ? STAGES.find((s) => s.key === k)!.name.replace(/^\d\. /, '') : 'Kept')

/** Turn filters on and off, add the Country and date filters to context, and see which rows survive each stage. */
export default function FilterOrder({ copy }: SimProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const result = runPipeline(settings)
  const { on, context } = settings
  const setOn = (id: FilterId, v: boolean) => setSettings({ ...settings, on: { ...on, [id]: v } })
  const setCtx = (id: 'country' | 'date', v: boolean) => setSettings({ ...settings, context: { ...context, [id]: v } })
  const topCase = on.top && on.country

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        <Inline text={copy.sample!} />
      </p>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Filters shelf</legend>
        {FILTERS.map((f) => {
          const hasCtx = f.id === 'country' || f.id === 'date'
          const inCtx = hasCtx && context[f.id as 'country' | 'date']
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-brand" checked={on[f.id]} onChange={(e) => setOn(f.id, e.target.checked)} />
                <span>
                  {f.label}: <span className="text-slate-500">{f.rule}</span>
                </span>
              </label>
              {hasCtx && (
                <Choice
                  label={`${f.label} runs as`}
                  value={inCtx ? 'ctx' : 'dim'}
                  disabled={!on[f.id]}
                  options={[
                    ['dim', 'Normal'],
                    ['ctx', 'Add to Context'],
                  ]}
                  onChange={(v) => setCtx(f.id as 'country' | 'date', v === 'ctx')}
                />
              )}
            </div>
          )
        })}
      </fieldset>

      <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <Inline text={copy.order!} />
      </p>

      <ol className="space-y-2" aria-label="Filter stages" aria-live="polite">
        {STAGES.map((s) => {
          const st = result.stages.find((x) => x.key === s.key)!
          const gray = s.key === 'context' && st.rules.length > 0
          return (
            <li key={s.key} className={`rounded-lg border p-3 text-sm ${gray ? 'border-slate-400 bg-slate-100' : 'border-slate-200 bg-white'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong>{s.name}</strong>
                <span>
                  {st.before} → <strong>{st.after}</strong> rows
                </span>
              </div>
              <p className="text-slate-600">{st.rules.length ? st.rules.join('; ') : 'No filter here.'}</p>
              <p className="mt-1 text-xs text-slate-500">
                <Inline text={copy[STAGE_COPY[s.key]]!} />
              </p>
              {s.key === 'dimension' && result.topPicked && (
                <p className="mt-1 text-xs">
                  Top {TOP_N} picked from the {st.before} rows that reached this stage: <strong>{result.topPicked.join(', ') || 'none'}</strong>
                </p>
              )}
            </li>
          )
        })}
        <li className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
          <Inline text={copy.tableCalc!} />
        </li>
      </ol>

      {topCase && (
        <p className="rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm" aria-live="polite">
          <Inline text={context.country ? copy.topWith! : copy.topWithout!} />
        </p>
      )}
      {!on.top && on.country && <p className="text-xs text-slate-500">{copy.topOff}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="p-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">Sample rows and where each one is removed</caption>
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {['Title', 'Genre', 'Country', 'Device', 'Start', 'Minutes', 'Result'].map((h) => (
                <th key={h} scope="col" className="px-2 py-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const out = result.removedAt[r.id] ?? null
              return (
                <tr key={r.id} className={`border-t border-slate-100 ${out ? 'text-slate-400 line-through decoration-slate-300' : ''}`}>
                  <th scope="row" className="px-2 py-1 font-normal">
                    {r.title}
                  </th>
                  <td className="px-2 py-1">{r.genre}</td>
                  <td className="px-2 py-1">{r.country}</td>
                  <td className="px-2 py-1">{r.device}</td>
                  <td className="px-2 py-1">{r.date}</td>
                  <td className="px-2 py-1">{r.minutes}</td>
                  <td className="px-2 py-1 no-underline">{removedLabel(out)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white" aria-live="polite">
        <table className="w-full text-left text-sm">
          <caption className="p-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            The view: SUM(Minutes) per title ({result.marks.length} mark{result.marks.length === 1 ? '' : 's'})
          </caption>
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-2 py-1 font-semibold">
                Title
              </th>
              <th scope="col" className="px-2 py-1 font-semibold">
                SUM(Minutes)
              </th>
            </tr>
          </thead>
          <tbody>
            {result.marks.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-2 py-1 text-slate-500">
                  No marks survive.
                </td>
              </tr>
            ) : (
              result.marks.map((m) => (
                <tr key={m.title} className="border-t border-slate-100">
                  <th scope="row" className="px-2 py-1 font-normal">
                    {m.title}
                  </th>
                  <td className="px-2 py-1">{m.minutes}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        <Inline text={copy.trap!} />
      </p>
    </div>
  )
}
