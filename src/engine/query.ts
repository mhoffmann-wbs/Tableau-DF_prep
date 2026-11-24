// Evaluates a viz spec over a data source (PLAN.md §6b), the way Tableau builds
// a view: row-level filters, then one mark per combination of the view's
// dimensions (its level of detail), then aggregation, then measure filters.
// Output columns are keyed c0, c1… because Vega-Lite treats dots and brackets
// in field names specially.
import { COUNTRIES } from '../data/geography.ts'
import { type CalcFields, evaluateGroup, rowValue } from './calc/index.ts'
import { calcsOf, type Dataset, type Row, type SourceRef, type Value } from './model.ts'
import { MONTHS, WEEKDAYS, aggregate, compareKeys, datePart, dateTrunc, display } from './values.ts'
import { EngineError, type ResolvedPill, resolvePill } from './pills.ts'
import { type DateLevel, type Filter, MEASURE_NAMES, type Pill, type VizSpec, pillsOf } from './spec.ts'

export interface Column extends ResolvedPill {
  id: string
  /** Discrete columns: every member in display order, aliased. */
  order?: string[]
  /** Set when the field has aliases: the underlying members, in the same order. */
  raw?: string[]
}

export interface QueryResult {
  columns: Column[]
  /** One row per mark, keyed by column id. Discrete values are display strings, dates on continuous columns epoch ms. */
  rows: Row[]
}

// ---- dates and members ----

export { aggregate, datePart, dateTrunc, display } from './values.ts'

function partLabel(n: number, level: DateLevel): string {
  if (level === 'quarter') return `Q${n}`
  if (level === 'month') return MONTHS[n - 1]!
  if (level === 'weekday') return WEEKDAYS[n - 1]!
  return String(n)
}

/** The canonical number of a date part's label (`Q3` → 3, `March` → 3, `Sunday` → 1), as `datePart` filters store it. */
export function partFromLabel(label: string, level: DateLevel): number {
  if (level === 'quarter') return Number(label.replace(/^Q/, ''))
  if (level === 'month') return MONTHS.indexOf(label) + 1
  if (level === 'weekday') return WEEKDAYS.indexOf(label) + 1
  return Number(label)
}

function valueLabel(ms: number, level: DateLevel): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  if (level === 'year') return String(y)
  if (level === 'quarter') return `Q${datePart(ms, 'quarter')} ${y}`
  if (level === 'month') return `${MONTHS[d.getUTCMonth()]} ${y}`
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${y}`
}

type Member = { value: Value; sortKey: number | string }

/** Reads a field from a row, computing row-level calcs. */
type Getter = (row: Row, field: string) => Value

function member(row: Row, rp: ResolvedPill, get: Getter): Member {
  const raw = get(row, rp.members ?? rp.field.name)
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

function rowFilter(f: Filter, spec: VizSpec, get: Getter): ((r: Row) => boolean) | undefined {
  const { field, agg } = resolvePill(spec, { field: f.field })
  // A Measure Names filter picks measures from the Measure Values card, not rows.
  if (field.special) return undefined
  const isDate = field.type === 'date' || field.type === 'datetime'
  switch (f.kind) {
    case 'values': {
      if (isDate) throw new EngineError(`Filter ${field.name} by a date range or a date part, not by values.`)
      if (agg === 'agg') throw new EngineError(`${field.name} is an aggregate calculation: filter it by a range of values.`)
      const set = new Set(f.values)
      return (r) => set.has(display(get(r, field.name))) !== (f.exclude ?? false)
    }
    case 'range':
      if (isMeasureFilter(f, spec)) return undefined // applied after aggregation
      return (r) => {
        const v = get(r, field.name)
        return typeof v === 'number' && (f.min === undefined || v >= f.min) && (f.max === undefined || v <= f.max)
      }
    case 'dateRange': {
      if (!isDate) throw new EngineError(`${field.name} is not a date.`)
      const from = f.from ? Date.parse(`${f.from}T00:00:00Z`) : -Infinity
      const to = f.to ? Date.parse(`${f.to}T00:00:00Z`) : Infinity
      return (r) => {
        const v = get(r, field.name)
        return typeof v === 'number' && dateTrunc(v, 'day') >= from && dateTrunc(v, 'day') <= to
      }
    }
    case 'datePart': {
      if (!isDate) throw new EngineError(`${field.name} is not a date.`)
      const set = new Set(f.values.map(Number))
      return (r) => {
        const v = get(r, field.name)
        return typeof v === 'number' && set.has(datePart(v, f.level))
      }
    }
  }
}

/** A range filter on an aggregated measure or an aggregate calc runs after aggregation. */
function isMeasureFilter(f: Filter, spec: VizSpec): boolean {
  return f.kind === 'range' && (f.agg !== undefined || resolvePill(spec, { field: f.field }).agg === 'agg')
}

/** A measure's value over a group of rows. */
function measureValue(calcs: CalcFields, get: Getter, rows: Row[], field: string, agg: ResolvedPill['agg']): Value {
  if (agg === 'agg') return evaluateGroup(calcs, calcs.calc(field)!, rows)
  return aggregate(
    rows.map((r) => get(r, field)),
    agg!,
  )
}

// ---- the query ----

export function query(spec: VizSpec, data: Dataset): QueryResult {
  const source = spec.source
  const calcs = calcsOf(spec, data[source])
  const get: Getter = (r, name) => rowValue(calcs, r, name)
  const columns: Column[] = []
  for (const pill of pillsOf(spec)) {
    const rp = resolvePill(spec, pill)
    if (!columns.some((c) => c.key === rp.key)) columns.push({ ...rp, id: `c${columns.length}` })
  }
  const dims = columns.filter((c) => c.kind === 'dimension' && !c.field.special)
  const measures = columns.filter((c) => c.kind === 'measure' && !c.field.special)
  const measureCards = measureValuesOf(spec, columns)

  const filters = spec.filters.map((f) => rowFilter(f, spec, get)).filter((f) => f !== undefined)
  // Show Members in Set keeps the members In the set.
  for (const c of columns) if (c.members) filters.push((r) => get(r, c.field.name) === 'In')
  const rows = data[source].filter((r) => filters.every((f) => f(r)))

  // One group per combination of dimension members: the view's level of detail.
  const groups = new Map<string, { members: Member[]; rows: Row[] }>()
  for (const r of rows) {
    const members = dims.map((d) => member(r, d, get))
    const key = JSON.stringify(members.map((m) => m.value))
    const g = groups.get(key)
    if (g) g.rows.push(r)
    else groups.set(key, { members, rows: [r] })
  }
  // A view without dimensions still has one mark, even when every row is filtered out.
  if (dims.length === 0 && groups.size === 0) groups.set('[]', { members: [], rows: [] })

  const measureFilters = spec.filters.filter((f): f is Extract<Filter, { kind: 'range' }> => isMeasureFilter(f, spec))
  const finestGeo = GEO_PRECEDENCE.map((g) => dims.find((d) => d.field.geo === g)).find((d) => d !== undefined)

  // `cards`: the value of each measure on the Measure Values card for this mark.
  let out: { members: Member[]; row: Row; cards: Value[] }[] = []
  for (const g of groups.values()) {
    if (
      !measureFilters.every((f) => {
        const v = measureValue(calcs, get, g.rows, f.field, f.agg ?? 'agg')
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
      } else row[m.id] = measureValue(calcs, get, g.rows, m.field.name, m.agg)
    }
    out.push({ members: g.members, row, cards: measureCards.map((m) => measureValue(calcs, get, g.rows, m.field.name, m.agg)) })
  }

  // Member order of each discrete dimension, then marks sorted by those orders.
  const rank = new Map<Column, Map<Value, number>>()
  for (const [i, d] of dims.entries()) {
    if (d.continuous) continue
    const seen = new Map<Value, number | string>()
    for (const o of out) seen.set(o.members[i]!.value, o.members[i]!.sortKey)
    let order = [...seen.keys()].sort((a, b) => compareKeys(seen.get(a)!, seen.get(b)!))
    // A pill's own sort wins over the field's default sort.
    const sort = d.pill.sort ?? (d.date ? undefined : d.field.sort)
    if (sort?.field) {
      const fieldAgg = resolvePill(spec, { field: sort.field })
      const by = resolvePill(spec, { field: sort.field, ...(fieldAgg.agg !== 'agg' && { agg: sort.agg }) } as Pill)
      if (by.kind !== 'measure') throw new EngineError(`Sort by a measure: ${by.label} is a dimension.`)
      const byMember = new Map<Value, Row[]>()
      for (const r of rows) {
        const m = member(r, d, get).value
        const list = byMember.get(m)
        if (list) list.push(r)
        else byMember.set(m, [r])
      }
      const value = (m: Value) => (measureValue(calcs, get, byMember.get(m) ?? [], by.field.name, by.agg) as number | null) ?? -Infinity
      order = [...order].sort((a, b) => value(a) - value(b))
    }
    if (sort?.order === 'desc') order.reverse()
    if (sort?.manual) order = [...sort.manual.filter((m) => order.includes(m)), ...order.filter((m) => !sort.manual!.includes(m as string))]
    d.order = order as string[]
    rank.set(d, new Map(order.map((m, j) => [m, j])))
  }
  // Aliases change only the labels; filters and sorts work on the underlying members.
  const aliased = dims.filter((d) => !d.continuous && !d.date && d.field.aliases)
  for (const d of aliased) {
    d.raw = d.order
    d.order = d.order!.map((m) => d.field.aliases![m] ?? m)
  }
  out = out.sort((a, b) => {
    for (const [i, d] of dims.entries()) {
      const r = rank.get(d)
      const diff = r ? r.get(a.members[i]!.value)! - r.get(b.members[i]!.value)! : compareKeys(a.members[i]!.sortKey, b.members[i]!.sortKey)
      if (diff) return diff
    }
    return 0
  })
  const alias = (row: Row) => {
    for (const d of aliased) row[d.id] = d.field.aliases![row[d.id] as string] ?? row[d.id]!
    return row
  }
  const rowsOut = out.map((o) => (aliased.length ? alias(o.row) : o.row))
  if (measureCards.length === 0) return { columns, rows: rowsOut }
  // Measure Names and Measure Values: one row per mark and measure.
  const names = columns.find((c) => c.field.special === 'names')
  const values = columns.find((c) => c.field.special === 'values')
  if (names) names.order = measureCards.map((m) => m.label)
  const unpivoted = rowsOut.flatMap((row, i) =>
    measureCards.map((m, j) => ({ ...row, ...(names && { [names.id]: m.label }), ...(values && { [values.id]: out[i]!.cards[j]! }) })),
  )
  return { columns, rows: unpivoted }
}

/**
 * The measures Measure Names and Measure Values stand for when either is in
 * the view: the Measure Values card, less those a Measure Names filter leaves out.
 */
function measureValuesOf(spec: VizSpec, columns: Column[]): ResolvedPill[] {
  if (!columns.some((c) => c.field.special)) return []
  const cards = spec.measureValues.map((p) => resolvePill(spec, p))
  for (const m of cards) {
    if (m.kind !== 'measure' || m.field.special || m.field.generated) throw new EngineError(`The Measure Values card holds measures: ${m.label} can’t go there.`)
  }
  const filter = spec.filters.find((f): f is Extract<Filter, { kind: 'values' }> => f.kind === 'values' && f.field === MEASURE_NAMES)
  const kept = filter ? cards.filter((m) => filter.values.includes(m.label) !== (filter.exclude ?? false)) : cards
  if (kept.length === 0) throw new EngineError('The Measure Values card is empty: add the measures to show, or drag a measure onto an axis.')
  return kept
}

/** The column a pill produced, for reading values in tests and checkpoints. */
export function columnOf(result: QueryResult, ref: SourceRef, pill: Pill): Column {
  const key = resolvePill(ref, pill).key
  const column = result.columns.find((c) => c.key === key)
  if (!column) throw new EngineError(`${pill.field} is not in the view.`)
  return column
}
