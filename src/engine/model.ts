// The Driftlight data model (PLAN.md §6b): field metadata and the three data
// sources the engine queries. Each source is the base table joined many-to-one
// to its lookups, so no row is duplicated and every measure keeps its grain;
// relationships vs. joins are taught by the data model simulator, not here.
//
// The metadata is the data source as it looks *after* the preparation lessons:
// Postal Code is a string with a geographic role and Release Year a discrete
// dimension. The raw CSVs (what Tableau shows first) live in public/data/.
import { type CalcType, CalcError, type CompiledCalc, compileFormula, type FieldInfo } from './calc/index.ts'
import type { Aggregation, Calc, SourceId } from './spec.ts'

export type FieldType = 'string' | 'number' | 'date' | 'datetime' | 'boolean'
export type GeoRole = 'country' | 'state' | 'city' | 'postal' | 'latitude' | 'longitude'

export interface Field {
  name: string
  type: FieldType
  role: 'dimension' | 'measure'
  /** Default aggregation of a measure. */
  agg?: Aggregation
  geo?: GeoRole
  /** Computed per mark from the finest geographic dimension in the view, as Tableau's Latitude/Longitude (generated). */
  generated?: boolean
  /** A calculated field: compiled, or the error that stops it. */
  calc?: { formula: string; compiled?: CompiledCalc; error?: CalcError }
}

/** A cell: dates and datetimes are epoch milliseconds (UTC). */
export type Value = string | number | boolean | null
export type Row = Record<string, Value>

const dim = (name: string, type: FieldType = 'string', geo?: GeoRole): Field => ({ name, type, role: 'dimension', ...(geo && { geo }) })
const measure = (name: string, agg: Aggregation = 'sum', geo?: GeoRole): Field => ({ name, type: 'number', role: 'measure', agg, ...(geo && { geo }) })

/** CSV columns, by file, as the engine types them. */
const TABLES: Record<string, Field[]> = {
  'subscribers.csv': [
    dim('Subscriber ID'),
    dim('Signup Date', 'date'),
    dim('Plan Code'),
    dim('Country', 'string', 'country'),
    dim('State/Province', 'string', 'state'),
    dim('City', 'string', 'city'),
    dim('Postal Code', 'string', 'postal'),
    measure('Latitude', 'avg', 'latitude'),
    measure('Longitude', 'avg', 'longitude'),
    dim('Age Band'),
    dim('Channel'),
  ],
  'plans.csv': [dim('Plan Code'), dim('Plan'), measure('Monthly Price'), measure('Screens'), dim('Ad Supported', 'boolean')],
  'titles.csv': [
    dim('Title ID'),
    dim('Title'),
    dim('Type'),
    dim('Genre'),
    dim('Sub-Genre'),
    dim('Release Year', 'number'),
    dim('Rating'),
    measure('Runtime'),
    dim('Original', 'boolean'),
  ],
  'sessions_2024.csv': [
    dim('Session ID'),
    dim('Subscriber ID'),
    dim('Title ID'),
    dim('Start', 'datetime'),
    measure('Minutes Watched'),
    dim('Device'),
    dim('Completed', 'boolean'),
  ],
  'cancellations.csv': [dim('Subscriber ID'), dim('Cancel Date', 'date'), dim('Reason')],
  'regions.csv': [dim('Country'), dim('Region'), dim('Regional Manager')],
}
TABLES['sessions_2025.csv'] = TABLES['sessions_2024.csv']!

export const DATA_FILES = Object.keys(TABLES)

const GENERATED: Field[] = [
  { name: 'Latitude (generated)', type: 'number', role: 'measure', agg: 'avg', geo: 'latitude', generated: true },
  { name: 'Longitude (generated)', type: 'number', role: 'measure', agg: 'avg', geo: 'longitude', generated: true },
]

const count = (name: string): Field => ({ name, type: 'number', role: 'measure', agg: 'sum' })

/** Fields of a source, in Data pane order (dimensions first, as Tableau lists them). */
function sourceFields(files: string[], countField: string): Field[] {
  const seen = new Map<string, Field>()
  for (const f of files) for (const field of TABLES[f]!) if (!seen.has(field.name)) seen.set(field.name, field)
  const all = [...seen.values(), count(countField), ...GENERATED]
  return [...all.filter((f) => f.role === 'dimension'), ...all.filter((f) => f.role === 'measure')]
}

export const SOURCE_INFO: Record<SourceId, { label: string; countField: string; fields: Field[] }> = {
  sessions: {
    label: 'Sessions',
    countField: 'Sessions (Count)',
    fields: sourceFields(['sessions_2024.csv', 'titles.csv', 'subscribers.csv', 'plans.csv', 'regions.csv'], 'Sessions (Count)'),
  },
  subscribers: {
    label: 'Subscribers',
    countField: 'Subscribers (Count)',
    fields: sourceFields(['subscribers.csv', 'plans.csv', 'regions.csv', 'cancellations.csv'], 'Subscribers (Count)'),
  },
  titles: { label: 'Titles', countField: 'Titles (Count)', fields: sourceFields(['titles.csv'], 'Titles (Count)') },
}

/** A data source plus the sheet's calculated fields: a spec, or a bare source with none. */
export type SourceRef = SourceId | { source: SourceId; calcs?: Calc[] }

const refSource = (ref: SourceRef): SourceId => (typeof ref === 'string' ? ref : ref.source)

/** Why a base field can't go into a formula, if it can't. */
function notInFormulas(field: Field, source: SourceId): string | undefined {
  if (field.name === SOURCE_INFO[source].countField)
    return `[${field.name}] can’t be used in a calculation. Count an ID field instead, for example COUNTD([${source === 'titles' ? 'Title' : source === 'subscribers' ? 'Subscriber' : 'Session'} ID]).`
  if (field.generated) return `[${field.name}] is generated by Tableau for maps and can’t be used in a calculation.`
  return undefined
}

const CALC_FIELD_TYPE: Record<Exclude<CalcType, 'null'>, FieldType> = { number: 'number', string: 'string', boolean: 'boolean', date: 'date', datetime: 'datetime' }

/** The field a compiled calc becomes: a number is a measure (SUM), an aggregate calc a measure, anything else a dimension. */
function calcField(calc: Calc, compiled: CompiledCalc): Field {
  const type = compiled.type === 'null' ? 'string' : CALC_FIELD_TYPE[compiled.type]
  const base = { name: calc.name, type, calc: { formula: calc.formula, compiled } }
  if (compiled.aggregate) return { ...base, role: 'measure' }
  return type === 'number' ? { ...base, role: 'measure', agg: 'sum' } : { ...base, role: 'dimension' }
}

/**
 * The calculated fields of a sheet, in order. A calc can use the source's
 * fields and the calcs before it. A broken calc stays in the list with its
 * error, so the Data pane can show it and pills on it turn red.
 */
export function calcFields(source: SourceId, calcs: Calc[]): Field[] {
  const base = SOURCE_INFO[source].fields
  const out: Field[] = []
  for (const calc of calcs) {
    const lookup = (name: string): FieldInfo | string => {
      const field = out.find((f) => f.name === name) ?? base.find((f) => f.name === name)
      if (!field) {
        const later = calcs.some((c) => c.name === name)
        return later ? `[${name}] is defined after this calculation (or is this calculation), so it can’t be used here.` : `There is no field [${name}] in the ${SOURCE_INFO[source].label} data source.`
      }
      const why = field.calc ? (field.calc.error ? `[${name}] has an error of its own; fix it first.` : undefined) : notInFormulas(field, source)
      if (why) return why
      return { type: field.calc?.compiled?.type ?? field.type, level: field.calc?.compiled?.aggregate ? 'agg' : 'row' }
    }
    let field: Field
    try {
      if (base.some((f) => f.name === calc.name) || out.some((f) => f.name === calc.name))
        throw new CalcError('field', `There is already a field called ${calc.name}. Give the calculation another name.`)
      const compiled = compileFormula(calc.formula, lookup)
      if (compiled.type === 'null') throw new CalcError('type', 'This formula always returns Null.')
      field = calcField(calc, compiled)
    } catch (e) {
      if (!(e instanceof CalcError)) throw e
      field = { name: calc.name, type: 'string', role: 'dimension', calc: { formula: calc.formula, error: e } }
    }
    out.push(field)
  }
  return out
}

// Compiling is cheap, but fieldOf runs for every pill on every render.
const fieldCache = new Map<string, Field[]>()

/** Every field of a source with the sheet's calcs, in Data pane order (dimensions, then measures). */
export function fieldsOf(ref: SourceRef): Field[] {
  const source = refSource(ref)
  const calcs = typeof ref === 'string' ? [] : (ref.calcs ?? [])
  if (calcs.length === 0) return SOURCE_INFO[source].fields
  const key = JSON.stringify([source, calcs])
  let fields = fieldCache.get(key)
  if (!fields) {
    if (fieldCache.size > 100) fieldCache.clear()
    const all = [...SOURCE_INFO[source].fields, ...calcFields(source, calcs)]
    fields = [...all.filter((f) => f.role === 'dimension'), ...all.filter((f) => f.role === 'measure')]
    fieldCache.set(key, fields)
  }
  return fields
}

export function fieldOf(ref: SourceRef, name: string): Field | undefined {
  return fieldsOf(ref).find((f) => f.name === name)
}

/** The compiled calcs of a sheet by name, for evaluating them. */
export function calcsOf(ref: SourceRef): { calc(name: string): CompiledCalc | undefined } {
  const byName = new Map(fieldsOf(ref).flatMap((f) => (f.calc?.compiled ? [[f.name, f.calc.compiled] as const] : [])))
  return { calc: (name) => byName.get(name) }
}

/** Parses RFC 4180 CSV (quoted fields, doubled quotes) into rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell !== '' || row.length) rows.push([...row, cell])
  return rows
}

function typed(raw: string, type: FieldType): Value {
  if (raw === '') return null
  switch (type) {
    case 'number':
      return Number(raw)
    case 'boolean':
      return raw === 'TRUE'
    case 'date':
      return Date.parse(`${raw}T00:00:00Z`)
    case 'datetime':
      return Date.parse(`${raw.replace(' ', 'T')}Z`)
    default:
      return raw
  }
}

function readTable(file: string, text: string): Row[] {
  const [header, ...lines] = parseCsv(text)
  const fields = TABLES[file]!
  if (header?.join(',') !== fields.map((f) => f.name).join(',')) throw new Error(`${file}: unexpected header ${header?.join(',')}`)
  return lines.map((cells) => Object.fromEntries(fields.map((f, i) => [f.name, typed(cells[i] ?? '', f.type)])))
}

/** Left-joins `lookup` rows onto `rows` by `key` (many-to-one, so rows never multiply). */
function join(rows: Row[], lookup: Row[], key: string): Row[] {
  const byKey = new Map(lookup.map((r) => [r[key], r]))
  // Unmatched rows get the lookup's fields as nulls, like a SQL left join.
  const nulls = Object.fromEntries(Object.keys(lookup[0] ?? {}).map((k) => [k, null]))
  return rows.map((r) => ({ ...nulls, ...byKey.get(r[key]), ...r }))
}

export type Dataset = Record<SourceId, Row[]>

/** Builds the three sources from the CSV texts in public/data/ (file name → text). */
export function buildDataset(texts: Record<string, string>): Dataset {
  const t = (file: string) => {
    const text = texts[file]
    if (text === undefined) throw new Error(`missing ${file}`)
    return readTable(file, text)
  }
  const regions = t('regions.csv')
  const plans = t('plans.csv')
  const titles = t('titles.csv')
  const subscribers = join(join(t('subscribers.csv'), plans, 'Plan Code'), regions, 'Country')
  const withCount = (rows: Row[], countField: string) => rows.map((r) => ({ ...r, [countField]: 1 }))
  return {
    sessions: withCount(
      join(join([...t('sessions_2024.csv'), ...t('sessions_2025.csv')], titles, 'Title ID'), subscribers, 'Subscriber ID'),
      'Sessions (Count)',
    ),
    subscribers: withCount(join(subscribers, t('cancellations.csv'), 'Subscriber ID'), 'Subscribers (Count)'),
    titles: withCount(titles, 'Titles (Count)'),
  }
}

let cached: Promise<Dataset> | undefined

/** Fetches public/data/ once per page load (browser only). */
export function loadDataset(): Promise<Dataset> {
  cached ??= Promise.all(
    DATA_FILES.map(async (f) => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${f}`)
      if (!res.ok) throw new Error(`Could not load ${f} (${res.status})`)
      return [f, await res.text()] as const
    }),
  ).then((entries) => buildDataset(Object.fromEntries(entries)))
  return cached
}
