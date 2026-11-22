// Evaluates a viz spec over a data source (PLAN.md §6b), the way Tableau builds
// a view: row-level filters, then one mark per combination of the view's
// dimensions (its level of detail), then aggregation, then measure filters.
// Output columns are keyed c0, c1… because Vega-Lite treats dots and brackets
// in field names specially.
import { COUNTRIES } from '../data/geography.ts'
import type { Dataset, Row, Value } from './model.ts'
import { EngineError, type ResolvedPill, resolvePill } from './pills.ts'
import { type Aggregation, type DateLevel, type Filter, type Pill, type VizSpec, pillsOf } from './spec.ts'

export interface Column extends ResolvedPill {
  id: string
  /** Discrete columns: every member in display order. */
  order?: string[]
}

export interface QueryResult {
  columns: Column[]
  /** One row per mark, keyed by column id. Discrete values are display strings, dates on continuous columns epoch ms. */
  rows: Row[]
}

// ---- dates (UTC) ----

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MS = 86_400_000

/** Canonical date part: YEAR 2025, QUARTER 1–4, MONTH 1–12, WEEK 1–53 (Sunday start), DAY 1–31, WEEKDAY 1–7 (Sunday = 1). */
export function datePart(ms: number, level: DateLevel): number {
  const d = new Date(ms)
  switch (level) {
    case 'year':
      return d.getUTCFullYear()
    case 'quarter':
      return Math.floor(d.getUTCMonth() / 3) + 1
    case 'month':
      return d.getUTCMonth() + 1
    case 'week': {
      const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1)
      const dayOfYear = Math.floor((ms - jan1) / DAY_MS)
      return Math.floor((dayOfYear + new Date(jan1).getUTCDay()) / 7) + 1
    }
    case 'day':
      return d.getUTCDate()
    case 'weekday':
      return d.getUTCDay() + 1
  }
}

/** Start of the date's year, quarter, month, week (Sunday) or day. */
export function dateTrunc(ms: number, level: Exclude<DateLevel, 'weekday'>): number {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  switch (level) {
    case 'year':
      return Date.UTC(y, 0, 1)
    case 'quarter':
      return Date.UTC(y, Math.floor(d.getUTCMonth() / 3) * 3, 1)
    case 'month':
      return Date.UTC(y, d.getUTCMonth(), 1)
    case 'week':
      return Date.UTC(y, d.getUTCMonth(), d.getUTCDate() - d.getUTCDay())
    case 'day':
      return Date.UTC(y, d.getUTCMonth(), d.getUTCDate())
  }
}

function partLabel(n: number, level: DateLevel): string {
  if (level === 'quarter') return `Q${n}`
  if (level === 'month') return MONTHS[n - 1]!
  if (level === 'weekday') return WEEKDAYS[n - 1]!
  return String(n)
}

function valueLabel(ms: number, level: DateLevel): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  if (level === 'year') return String(y)
  if (level === 'quarter') return `Q${datePart(ms, 'quarter')} ${y}`
  if (level === 'month') return `${MONTHS[d.getUTCMonth()]} ${y}`
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${y}`
}

// ---- dimension members ----

/** Display form of a raw value, as Tableau shows members (and as `values` filters name them). */
export function display(v: Value): string {
  if (v === null) return 'Null'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return String(v)
}

type Member = { value: Value; sortKey: number | string }

function member(row: Row, rp: ResolvedPill): Member {
  const raw = row[rp.field.name] ?? null
  if (rp.date) {
    if (raw === null) return { value: rp.continuous ? null : 'Null', sortKey: Infinity }
    const { level, mode } = rp.date
    const n = mode === 'part' ? datePart(raw as number, level) : dateTrunc(raw as number, level as Exclude<DateLevel, 'weekday'>)
    if (rp.continuous) return { value: n, sortKey: n }
    return { value: mode === 'part' ? partLabel(n, level) : valueLabel(n, level), sortKey: n }
  }
  if (rp.continuous) return { value: raw, sortKey: typeof raw === 'number' ? raw : Infinity }
  if (raw === null) return { value: 'Null', sortKey: '￿' }
  if (typeof raw === 'number') return { value: String(raw), sortKey: raw }
  return { value: display(raw), sortKey: display(raw).toLowerCase() }
}

const compareKeys = (a: number | string, b: number | string) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en')

// ---- aggregation ----

export function aggregate(values: Value[], agg: Aggregation): Value {
  const present = values.filter((v) => v !== null)
  if (agg === 'count') return present.length
  if (agg === 'countd') return new Set(present).size
  if (present.length === 0) return null
  switch (agg) {
    case 'sum':
      return (present as number[]).reduce((a, b) => a + b, 0)
    case 'avg':
      return (present as number[]).reduce((a, b) => a + b, 0) / present.length
    case 'median': {
      const s = [...(present as number[])].sort((a, b) => a - b)
      const mid = Math.floor(s.length / 2)
      return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
    }
    case 'min':
    case 'max': {
      const sorted = [...present].sort((a, b) => compareKeys(a as number | string, b as number | string))
      return agg === 'min' ? sorted[0]! : sorted[sorted.length - 1]!
    }
    case 'attr':
      return present.every((v) => v === present[0]) ? present[0]! : '*'
  }
}

// ---- generated latitude/longitude ----

const CITY_COORDS = new Map<string, [number, number]>()
const STATE_CITIES = new Map<string, [number, number][]>()
const COUNTRY_CITIES = new Map<string, [number, number][]>()
const ZIP_CITIES: { zip: number; coords: [number, number] }[] = []
for (const country of COUNTRIES) {
  for (const city of country.cities) {
    const coords: [number, number] = [city.lat, city.lon]
    CITY_COORDS.set(city.city, coords)
    if (city.alt) CITY_COORDS.set(city.alt, coords)
    if (city.state) STATE_CITIES.set(city.state, [...(STATE_CITIES.get(city.state) ?? []), coords])
    COUNTRY_CITIES.set(country.country, [...(COUNTRY_CITIES.get(country.country) ?? []), coords])
    if (city.zip) ZIP_CITIES.push({ zip: Number(city.zip), coords })
  }
}
const mean = (cs: [number, number][]): [number, number] => [cs.reduce((s, c) => s + c[0], 0) / cs.length, cs.reduce((s, c) => s + c[1], 0) / cs.length]

const GEO_PRECEDENCE = ['postal', 'city', 'state', 'country'] as const

function geoCoords(geo: (typeof GEO_PRECEDENCE)[number], name: string): [number, number] | undefined {
  if (geo === 'city') return CITY_COORDS.get(name)
  if (geo === 'state') return STATE_CITIES.has(name) ? mean(STATE_CITIES.get(name)!) : undefined
  if (geo === 'country') return COUNTRY_CITIES.has(name) ? mean(COUNTRY_CITIES.get(name)!) : undefined
  const zip = Number(name)
  return ZIP_CITIES.find((z) => zip - z.zip >= 0 && zip - z.zip <= 8)?.coords
}

// ---- filters ----

function rowFilter(f: Filter, source: VizSpec['source']): ((r: Row) => boolean) | undefined {
  const field = resolvePill(source, { field: f.field }).field
  const isDate = field.type === 'date' || field.type === 'datetime'
  switch (f.kind) {
    case 'values': {
      if (isDate) throw new EngineError(`Filter ${field.name} by a date range or a date part, not by values.`)
      const set = new Set(f.values)
      return (r) => set.has(display(r[field.name] ?? null)) !== (f.exclude ?? false)
    }
    case 'range':
      if (f.agg) return undefined // a measure filter: applied after aggregation
      return (r) => {
        const v = r[field.name]
        return typeof v === 'number' && (f.min === undefined || v >= f.min) && (f.max === undefined || v <= f.max)
      }
    case 'dateRange': {
      if (!isDate) throw new EngineError(`${field.name} is not a date.`)
      const from = f.from ? Date.parse(`${f.from}T00:00:00Z`) : -Infinity
      const to = f.to ? Date.parse(`${f.to}T00:00:00Z`) : Infinity
      return (r) => {
        const v = r[field.name]
        return typeof v === 'number' && dateTrunc(v, 'day') >= from && dateTrunc(v, 'day') <= to
      }
    }
    case 'datePart': {
      if (!isDate) throw new EngineError(`${field.name} is not a date.`)
      const set = new Set(f.values.map(Number))
      return (r) => {
        const v = r[field.name]
        return typeof v === 'number' && set.has(datePart(v, f.level))
      }
    }
  }
}

// ---- the query ----

export function query(spec: VizSpec, data: Dataset): QueryResult {
  const source = spec.source
  const columns: Column[] = []
  for (const pill of pillsOf(spec)) {
    const rp = resolvePill(source, pill)
    if (!columns.some((c) => c.key === rp.key)) columns.push({ ...rp, id: `c${columns.length}` })
  }
  const dims = columns.filter((c) => c.kind === 'dimension')
  const measures = columns.filter((c) => c.kind === 'measure')

  const filters = spec.filters.map((f) => rowFilter(f, source)).filter((f) => f !== undefined)
  const rows = data[source].filter((r) => filters.every((f) => f(r)))

  // One group per combination of dimension members: the view's level of detail.
  const groups = new Map<string, { members: Member[]; rows: Row[] }>()
  for (const r of rows) {
    const members = dims.map((d) => member(r, d))
    const key = JSON.stringify(members.map((m) => m.value))
    const g = groups.get(key)
    if (g) g.rows.push(r)
    else groups.set(key, { members, rows: [r] })
  }
  // A view without dimensions still has one mark, even when every row is filtered out.
  if (dims.length === 0 && groups.size === 0) groups.set('[]', { members: [], rows: [] })

  const measureFilters = spec.filters.filter((f): f is Extract<Filter, { kind: 'range' }> => f.kind === 'range' && f.agg !== undefined)
  const finestGeo = GEO_PRECEDENCE.map((g) => dims.find((d) => d.field.geo === g)).find((d) => d !== undefined)

  let out: { members: Member[]; row: Row }[] = []
  for (const g of groups.values()) {
    if (
      !measureFilters.every((f) => {
        const v = aggregate(g.rows.map((r) => r[f.field] ?? null), f.agg!)
        return typeof v === 'number' && (f.min === undefined || v >= f.min) && (f.max === undefined || v <= f.max)
      })
    )
      continue
    const row: Row = {}
    dims.forEach((d, i) => (row[d.id] = g.members[i]!.value))
    for (const m of measures) {
      if (m.field.generated) {
        if (!finestGeo) throw new EngineError(`${m.field.name} needs a geographic field (Country, State/Province, City or Postal Code) in the view.`)
        const name = g.members[dims.indexOf(finestGeo)]!.value
        const coords = typeof name === 'string' ? geoCoords(finestGeo.field.geo as (typeof GEO_PRECEDENCE)[number], name) : undefined
        row[m.id] = coords ? coords[m.field.geo === 'latitude' ? 0 : 1] : null
      } else row[m.id] = aggregate(g.rows.map((r) => r[m.field.name] ?? null), m.agg!)
    }
    out.push({ members: g.members, row })
  }

  // Member order of each discrete dimension, then marks sorted by those orders.
  const rank = new Map<Column, Map<Value, number>>()
  for (const [i, d] of dims.entries()) {
    if (d.continuous) continue
    const seen = new Map<Value, number | string>()
    for (const o of out) seen.set(o.members[i]!.value, o.members[i]!.sortKey)
    let order = [...seen.keys()].sort((a, b) => compareKeys(seen.get(a)!, seen.get(b)!))
    const sort = d.pill.sort
    if (sort?.field) {
      const by = resolvePill(source, { field: sort.field, agg: sort.agg } as Pill)
      if (by.kind !== 'measure') throw new EngineError(`Sort by a measure: ${by.label} is a dimension.`)
      const totals = new Map<Value, Value[]>()
      for (const r of rows) {
        const m = member(r, d).value
        totals.set(m, [...(totals.get(m) ?? []), r[by.field.name] ?? null])
      }
      const value = (m: Value) => (aggregate(totals.get(m) ?? [], by.agg!) as number | null) ?? -Infinity
      order = [...order].sort((a, b) => value(a) - value(b))
    }
    if (sort?.order === 'desc') order.reverse()
    if (sort?.manual) order = [...sort.manual.filter((m) => order.includes(m)), ...order.filter((m) => !sort.manual!.includes(m as string))]
    d.order = order as string[]
    rank.set(d, new Map(order.map((m, j) => [m, j])))
  }
  out = out.sort((a, b) => {
    for (const [i, d] of dims.entries()) {
      const r = rank.get(d)
      const diff = r ? r.get(a.members[i]!.value)! - r.get(b.members[i]!.value)! : compareKeys(a.members[i]!.sortKey, b.members[i]!.sortKey)
      if (diff) return diff
    }
    return 0
  })
  return { columns, rows: out.map((o) => o.row) }
}

/** The column a pill produced, for reading values in tests and checkpoints. */
export function columnOf(result: QueryResult, source: VizSpec['source'], pill: Pill): Column {
  const key = resolvePill(source, pill).key
  const column = result.columns.find((c) => c.key === key)
  if (!column) throw new EngineError(`${pill.field} is not in the view.`)
  return column
}
