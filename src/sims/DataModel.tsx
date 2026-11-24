import { useState } from 'react'
import type { SimProps } from '.'
import { Choice } from './Choice'

export const COPY_KEYS = ['sample', 'inner', 'left', 'right', 'full', 'union', 'relationship', 'blend', 'inflated', 'dropped', 'exact'] as const

export type Cell = string | number | null
export type Method = 'inner' | 'left' | 'right' | 'full' | 'union' | 'relationship' | 'blend'
export type Primary = 'plans' | 'sessions'

export interface PlanRow {
  plan: string
  price: number
}
export interface SessionRow {
  id: string
  plan: string
  minutes: number
}

/** Invented sample rows: one plan with no sessions (Family), one session with no plan (Promo). */
export const PLANS: PlanRow[] = [
  { plan: 'Basic', price: 10 },
  { plan: 'Standard', price: 15 },
  { plan: 'Premium', price: 20 },
  { plan: 'Family', price: 25 },
]
export const SESSIONS_2024: SessionRow[] = [
  { id: 's1', plan: 'Basic', minutes: 30 },
  { id: 's2', plan: 'Basic', minutes: 45 },
  { id: 's3', plan: 'Basic', minutes: 20 },
  { id: 's4', plan: 'Standard', minutes: 60 },
  { id: 's5', plan: 'Standard', minutes: 40 },
  { id: 's6', plan: 'Premium', minutes: 90 },
  { id: 's7', plan: 'Promo', minutes: 25 },
]
export const SESSIONS_2025: SessionRow[] = [
  { id: 's8', plan: 'Basic', minutes: 35 },
  { id: 's9', plan: 'Premium', minutes: 50 },
  { id: 's10', plan: 'Standard', minutes: 25 },
]

export interface Combined {
  headers: string[]
  rows: { cells: Cell[]; flag: '' | 'repeat' | 'null' | 'repeat, null' }[]
  /** Rows of the merged table, or null when there is none (relationship). */
  rowCount: number | null
  /** SUM(Monthly Price) and SUM(Minutes) as the method gives them; null when the measure isn't there. */
  price: number | null
  minutes: number | null
  /** What each table says on its own (the same measures, summed over the tables). */
  truePrice: number | null
  trueMinutes: number
}

const sum = (xs: Cell[]): number | null => {
  const n = xs.filter((x): x is number => typeof x === 'number')
  return n.length ? n.reduce((a, b) => a + b, 0) : null
}
const flagOf = (repeat: boolean, nulls: boolean): Combined['rows'][number]['flag'] => (repeat && nulls ? 'repeat, null' : repeat ? 'repeat' : nulls ? 'null' : '')

/** Joins Plans (left) to Sessions (right) on Plan. Rows of Plans come first, then unmatched sessions. */
export function joinRows(type: 'inner' | 'left' | 'right' | 'full', plans = PLANS, sessions = SESSIONS_2024): Combined['rows'] {
  const out: Combined['rows'] = []
  for (const p of plans) {
    const hits = sessions.filter((s) => s.plan === p.plan)
    hits.forEach((s, i) => out.push({ cells: [p.plan, p.price, s.id, s.plan, s.minutes], flag: flagOf(i > 0, false) }))
    // The price repeats on every matching row after the first; a plan without sessions is kept by left and full.
    if (!hits.length && (type === 'left' || type === 'full')) out.push({ cells: [p.plan, p.price, null, null, null], flag: 'null' })
  }
  if (type === 'right' || type === 'full') {
    for (const s of sessions) if (!plans.some((p) => p.plan === s.plan)) out.push({ cells: [null, null, s.id, s.plan, s.minutes], flag: 'null' })
  }
  if (type === 'right') {
    // A right join keeps session order: sort by session number in the sample.
    out.sort((a, b) => Number(String(a.cells[2]).slice(1)) - Number(String(b.cells[2]).slice(1)))
  }
  return out
}

/** Link-field members of the primary source in order of appearance. */
const distinct = (xs: string[]) => [...new Set(xs)]

export function combine(method: Method, primary: Primary = 'plans'): Combined {
  const truePrice = sum(PLANS.map((p) => p.price))
  const trueMinutes = sum(SESSIONS_2024.map((s) => s.minutes))!
  const base = { truePrice, trueMinutes }

  if (method === 'union') {
    const all = [...SESSIONS_2024.map((s) => ({ ...s, table: 'Sessions 2024' })), ...SESSIONS_2025.map((s) => ({ ...s, table: 'Sessions 2025' }))]
    return {
      headers: ['Table Name', 'Session', 'Plan', 'Minutes'],
      rows: all.map((s) => ({ cells: [s.table, s.id, s.plan, s.minutes], flag: '' })),
      rowCount: all.length,
      price: null,
      minutes: sum(all.map((s) => s.minutes)),
      truePrice: null,
      trueMinutes: sum([...SESSIONS_2024, ...SESSIONS_2025].map((s) => s.minutes))!,
    }
  }

  if (method === 'relationship') {
    return {
      headers: ['Table', 'Rows (own level)', 'Measure', 'SUM'],
      rows: [
        { cells: ['Plans', PLANS.length, 'Monthly Price', sum(PLANS.map((p) => p.price))], flag: '' },
        { cells: ['Sessions', SESSIONS_2024.length, 'Minutes', trueMinutes], flag: '' },
      ],
      rowCount: null,
      price: truePrice,
      minutes: trueMinutes,
      ...base,
    }
  }

  if (method === 'blend') {
    // Rows are the link-field members of the primary source; the secondary's measure is aggregated per member.
    const members = distinct(primary === 'plans' ? PLANS.map((p) => p.plan) : SESSIONS_2024.map((s) => s.plan))
    const rows = members.map((m) => {
      const planRows = PLANS.filter((p) => p.plan === m).map((p) => p.price)
      const sessRows = SESSIONS_2024.filter((s) => s.plan === m).map((s) => s.minutes)
      const price = sum(planRows)
      const minutes = sum(sessRows)
      return { cells: [m, price, minutes] as Cell[], flag: flagOf(false, price === null || minutes === null) }
    })
    return {
      headers: ['Plan (link field)', 'SUM(Monthly Price)', 'SUM(Minutes)'],
      rows,
      rowCount: rows.length,
      price: sum(rows.map((r) => r.cells[1]!)),
      minutes: sum(rows.map((r) => r.cells[2]!)),
      ...base,
    }
  }

  const rows = joinRows(method)
  return {
    headers: ['Plan', 'Monthly Price', 'Session', 'Plan', 'Minutes'],
    rows,
    rowCount: rows.length,
    price: sum(rows.map((r) => r.cells[1]!)),
    minutes: sum(rows.map((r) => r.cells[4]!)),
    ...base,
  }
}

export type Status = 'inflated' | 'short' | 'exact'
export function statusOf(value: number | null, truth: number | null): Status {
  if (value === null || truth === null) return 'short'
  return value > truth ? 'inflated' : value < truth ? 'short' : 'exact'
}

const METHODS: [Method, string][] = [
  ['inner', 'Inner join'],
  ['left', 'Left join'],
  ['right', 'Right join'],
  ['full', 'Full outer join'],
  ['union', 'Union'],
  ['relationship', 'Relationship'],
  ['blend', 'Blend'],
]
const STATUS_TEXT: Record<Status, string> = { inflated: 'too large', short: 'too small', exact: 'matches' }

function DataTable({ caption, headers, rows, flagged = false }: { caption: string; headers: string[]; rows: Combined['rows']; flagged?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">{caption}</caption>
        <thead>
          <tr className="border-y border-slate-200 text-slate-600">
            {headers.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-1.5 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
            {flagged && (
              <th scope="col" className="px-3 py-1.5 font-semibold">
                Flag
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.flag.includes('repeat') ? 'bg-brand/10' : r.flag === 'null' ? 'bg-slate-100' : ''}>
              {r.cells.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-1 font-medium whitespace-nowrap">
                    {c ?? <em className="text-slate-500">null</em>}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-1 whitespace-nowrap">
                    {c ?? <em className="text-slate-500">null</em>}
                  </td>
                ),
              )}
              {flagged && <td className="px-3 py-1 text-xs whitespace-nowrap text-slate-600">{r.flag === 'repeat' ? 'price repeated' : r.flag === 'null' ? 'null-filled' : r.flag === '' ? '' : 'repeated, null-filled'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const plansRows = (): Combined['rows'] => PLANS.map((p) => ({ cells: [p.plan, p.price], flag: '' }))
const sessionRows = (xs: SessionRow[]): Combined['rows'] => xs.map((s) => ({ cells: [s.id, s.plan, s.minutes], flag: '' }))

/** Two small tables combined as a join, union, relationship or blend, with the row count and the SUMs it gives. */
export default function DataModel({ copy }: SimProps) {
  const [method, setMethod] = useState<Method>('left')
  const [primary, setPrimary] = useState<Primary>('plans')
  const result = combine(method, primary)
  const isJoin = ['inner', 'left', 'right', 'full'].includes(method)
  const measures: [string, number | null, number | null][] = [
    ['SUM(Monthly Price)', result.price, result.truePrice],
    ['SUM(Minutes)', result.minutes, result.trueMinutes],
  ]
  const shown = measures.filter(([, v]) => v !== null || method === 'blend' || isJoin)
  const statuses = shown.map(([, v, t]) => statusOf(v, t))
  const fmt = (n: number | null) => (n === null ? 'null' : n.toLocaleString('en-US'))

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{copy.sample}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <DataTable caption="Plans (one row per plan)" headers={['Plan', 'Monthly Price']} rows={plansRows()} />
        <DataTable caption="Sessions 2024" headers={['Session', 'Plan', 'Minutes']} rows={sessionRows(SESSIONS_2024)} />
        <DataTable caption="Sessions 2025 (same columns)" headers={['Session', 'Plan', 'Minutes']} rows={sessionRows(SESSIONS_2025)} />
      </div>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Choice label="Combine with" value={method} options={METHODS} onChange={setMethod} />
        {method === 'blend' && (
          <Choice
            label="Primary data source"
            value={primary}
            options={[
              ['plans', 'Plans'],
              ['sessions', 'Sessions'],
            ]}
            onChange={setPrimary}
          />
        )}
        {isJoin && <p className="self-end text-sm text-slate-600">Join clause: Plans.Plan = Sessions.Plan</p>}
      </div>
      <div aria-live="polite" className="space-y-3">
        <p className="rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">{copy[method]}</p>
        <DataTable
          caption={`Result: ${METHODS.find(([m]) => m === method)![1]}`}
          headers={result.headers}
          rows={result.rows}
          flagged={isJoin}
        />
        <ul className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <li>
            Rows: <strong>{result.rowCount === null ? 'no merged table: each table keeps its own rows' : result.rowCount}</strong>
          </li>
          {shown.map(([label, v, t], i) => (
            <li key={label}>
              {label}: <strong>{fmt(v)}</strong> ({STATUS_TEXT[statuses[i]!]}; the table’s own total is {fmt(t)})
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-700">
          {statuses.includes('inflated') ? copy.inflated : statuses.includes('short') ? copy.dropped : copy.exact}
        </p>
      </div>
    </div>
  )
}
