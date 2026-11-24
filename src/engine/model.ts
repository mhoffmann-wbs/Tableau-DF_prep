// The Driftlight data model (PLAN.md §6b): field metadata and the three data
// sources the engine queries. Each source is the base table joined many-to-one
// to its lookups, so no row is duplicated and every measure keeps its grain;
// relationships vs. joins are taught by the data model simulator, not here.
//
// The metadata is the data source as it looks *after* the preparation lessons:
// Postal Code is a string with a geographic role and Release Year a discrete
// dimension. The raw CSVs (what Tableau shows first) live in public/data/.
import { type CalcType, CalcError, type CompiledCalc, compileFormula, type FieldInfo, formatDate } from './calc/index.ts'
import type { Aggregation, Bin, Calc, FieldEdit, FieldType, GeoRole, Group, NumberFormat, SetDef, Sort, SourceId } from './spec.ts'
import { aggregate, display } from './values.ts'

export type { FieldType, GeoRole } from './spec.ts'

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
  /** Set when the sheet changed the field in the Data pane: its data source name and type. */
  original?: { name: string; type: FieldType }
  /** Default discrete or continuous, from Convert to Discrete/Continuous. */
  as?: 'discrete' | 'continuous'
  aliases?: Record<string, string>
  format?: NumberFormat
  /** Default sort of a dimension's members. */
  sort?: Sort
  comment?: string
  /** A group, set or bin made from another field (`def.field`). */
  derived?: { kind: 'group'; def: Group } | { kind: 'set'; def: SetDef } | { kind: 'bin'; def: Bin }
  /** Why a group, set or bin can't be used, for example when its field is gone. */
  broken?: string
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

/** A data source plus the sheet's field edits and calculated fields: a spec, or a bare source with none. */
export type SourceRef = SourceId | Sheet

/** What decides a sheet's fields: the source, field edits, groups, sets, bins and calcs. */
export interface Sheet {
  source: SourceId
  calcs?: Calc[]
  fields?: FieldEdit[]
  groups?: Group[]
  sets?: SetDef[]
  bins?: Bin[]
}

/** The part of a spec that decides its fields, without shelves or filters (so it keys caches and loads). */
export function sheetOf(ref: SourceRef): Sheet {
  if (typeof ref === 'string') return { source: ref }
  const { source, calcs, fields, groups, sets, bins } = ref
  return { source, calcs, fields, groups, sets, bins }
}

// ---- field edits (Data pane) ----

/**
 * The data types each type can be changed to. The help's rules for values
 * that don't fit ("Text is treated as Null" in a number or date field) give
 * the results; types whose conversion the help leaves open (Boolean, number
 * to date) aren't offered.
 */
export const TYPE_CHANGES: Record<FieldType, FieldType[]> = {
  string: ['number', 'date', 'datetime'],
  number: ['string'],
  date: ['string', 'datetime'],
  datetime: ['string', 'date'],
  boolean: [],
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/

/** A value read as another data type; what can't be read becomes Null. */
export function convertValue(v: Value, from: FieldType, to: FieldType): Value {
  if (v === null || from === to) return v
  if (to === 'string') return typeof v === 'number' && (from === 'date' || from === 'datetime') ? formatDate(v, from === 'datetime') : String(v)
  if (from === 'string') {
    const text = String(v).trim()
    if (to === 'number') return text !== '' && Number.isFinite(Number(text)) ? Number(text) : null
    // ISO text is the one date form the sandbox reads; other text is Null.
    if (ISO_DATE.test(text)) return Date.parse(`${text}T00:00:00Z`)
    if (to === 'datetime' && ISO_DATETIME.test(text)) return Date.parse(`${text.replace(' ', 'T')}Z`)
    return null
  }
  if (from === 'datetime' && to === 'date') return Math.floor((v as number) / 86_400_000) * 86_400_000
  return v // date → datetime: midnight
}

/** Which Data pane edits a field takes: base fields only, not calcs, groups, sets, bins, counts or generated coordinates. */
export function isEditable(field: Field, source: SourceId): boolean {
  return !field.calc && !field.derived && !field.generated && field.name !== SOURCE_INFO[source].countField
}

function applyEdit(field: Field, edit: FieldEdit | undefined): Field {
  if (!edit) return field
  const type = edit.type ?? field.type
  const role = edit.role ?? field.role
  let geo = edit.geo === null ? undefined : (edit.geo ?? field.geo)
  // Latitude and Longitude roles are for numbers only.
  if ((geo === 'latitude' || geo === 'longitude') && type !== 'number') geo = undefined
  const out: Field = { name: edit.name ?? field.name, type, role, original: { name: field.name, type: field.type } }
  if (role === 'measure') out.agg = edit.agg ?? field.agg ?? (type === 'number' ? 'sum' : 'count')
  if (geo) out.geo = geo
  if (edit.as) out.as = edit.as
  if (edit.aliases && Object.keys(edit.aliases).length) out.aliases = edit.aliases
  if (edit.format) out.format = edit.format
  if (edit.sort) out.sort = edit.sort
  if (edit.comment) out.comment = edit.comment
  return out
}

/** The source's fields with the sheet's edits, before calcs. */
function editedFields(source: SourceId, edits: FieldEdit[]): Field[] {
  const base = SOURCE_INFO[source].fields
  if (edits.length === 0) return base
  const all = base.map((f) => (isEditable(f, source) ? applyEdit(f, edits.find((e) => e.field === f.name)) : f))
  return [...all.filter((f) => f.role === 'dimension'), ...all.filter((f) => f.role === 'measure')]
}

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

// ---- groups, sets and bins ----

/** The groups, sets and bins of a sheet as fields, built on the edited source fields. */
function derivedFields(base: Field[], sheet: Sheet): Field[] {
  const out: Field[] = []
  const taken = (name: string) => base.some((f) => f.name === name) || out.some((f) => f.name === name)
  const add = (field: Field, def: { name: string; field: string }, check: (src: Field) => string | undefined) => {
    const src = base.find((f) => f.name === def.field)
    const broken = taken(def.name) ? `There is already a field called ${def.name}.` : !src ? `${def.name} is based on ${def.field}, which isn’t in the data source any more.` : check(src)
    out.push(broken ? { ...field, broken } : field)
  }
  const dimensionOnly = (src: Field) =>
    src.role !== 'dimension' || src.type === 'date' || src.type === 'datetime' ? `${src.name} must be a dimension that isn’t a date.` : undefined
  for (const def of sheet.groups ?? []) add({ name: def.name, type: 'string', role: 'dimension', derived: { kind: 'group', def } }, def, dimensionOnly)
  for (const def of sheet.sets ?? [])
    add({ name: def.name, type: 'string', role: 'dimension', derived: { kind: 'set', def } }, def, (src) => {
      if (dimensionOnly(src)) return dimensionOnly(src)
      if (def.rule.kind === 'members') return undefined
      const by = base.find((f) => f.name === (def.rule as { field: string }).field)
      return by ? undefined : `The set ${def.name} uses ${(def.rule as { field: string }).field}, which isn’t in the data source any more.`
    })
  for (const def of sheet.bins ?? [])
    add({ name: def.name, type: 'number', role: 'dimension', derived: { kind: 'bin', def } }, def, (src) =>
      src.type !== 'number' || src.generated ? `Bins need a number field; ${src.name} is a ${src.type} field.` : undefined,
    )
  return out
}

/** A bin's lower limit (inclusive): 0–9, 10–19… for size 10. */
// Rounding the quotient keeps decimal edges in their own bin (0.3 / 0.1 is 2.999… in floating point).
export const binOf = (v: number, size: number): number => Number((Math.floor(Number((v / size).toPrecision(12))) * size).toPrecision(12))

/** Whether a member (its display string) passes a set's condition or top rule, computed over every row of the source. */
function dynamicMembers(def: SetDef, rows: Row[], read: (row: Row, name: string) => Value): Set<string> {
  const rule = def.rule
  if (rule.kind === 'members') return new Set()
  const byMember = new Map<string, Value[]>()
  for (const r of rows) {
    const m = display(read(r, def.field))
    const list = byMember.get(m)
    if (list) list.push(read(r, rule.field))
    else byMember.set(m, [read(r, rule.field)])
  }
  const value = new Map([...byMember].map(([m, vs]) => [m, aggregate(vs, rule.agg)]))
  if (rule.kind === 'condition') {
    const pass = (v: Value) => {
      if (typeof v !== 'number') return false
      switch (rule.op) {
        case '>':
          return v > rule.value
        case '>=':
          return v >= rule.value
        case '<':
          return v < rule.value
        case '<=':
          return v <= rule.value
        case '=':
          return v === rule.value
        case '<>':
          return v !== rule.value
      }
    }
    return new Set([...value].filter(([, v]) => pass(v)).map(([m]) => m))
  }
  const ranked = [...value].filter(([, v]) => typeof v === 'number').sort((a, b) => (b[1] as number) - (a[1] as number))
  if (rule.from === 'bottom') ranked.reverse()
  return new Set(ranked.slice(0, rule.n).map(([m]) => m))
}

/**
 * The calculated fields of a sheet, in order. A calc can use the source's
 * fields and the calcs before it. A broken calc stays in the list with its
 * error, so the Data pane can show it and pills on it turn red.
 */
export function calcFields(sheet: Sheet, calcs: Calc[]): Field[] {
  const { source } = sheet
  const base = editedFields(source, sheet.fields ?? [])
  const derived = derivedFields(base, sheet)
  const out: Field[] = []
  for (const calc of calcs) {
    const lookup = (name: string): FieldInfo | string => {
      const field = out.find((f) => f.name === name) ?? base.find((f) => f.name === name)
      if (!field) {
        if (derived.some((f) => f.name === name)) return `The sandbox can’t use groups, sets or bins in calculations, so [${name}] can’t be used here.`
        const later = calcs.some((c) => c.name === name)
        return later ? `[${name}] is defined after this calculation (or is this calculation), so it can’t be used here.` : `There is no field [${name}] in the ${SOURCE_INFO[source].label} data source.`
      }
      const why = field.calc ? (field.calc.error ? `[${name}] has an error of its own; fix it first.` : undefined) : notInFormulas(field.original ? { ...field, name: field.original.name } : field, source)
      if (why) return why
      return { type: field.calc?.compiled?.type ?? field.type, level: field.calc?.compiled?.aggregate ? 'agg' : 'row' }
    }
    let field: Field
    try {
      if ([...base, ...derived, ...out].some((f) => f.name === calc.name))
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

/** Every field of a source with the sheet's edits and calcs, in Data pane order (dimensions, then measures). */
export function fieldsOf(ref: SourceRef): Field[] {
  const source = refSource(ref)
  const sheet = sheetOf(ref)
  if (!sheet.calcs?.length && !sheet.fields?.length && !sheet.groups?.length && !sheet.sets?.length && !sheet.bins?.length) return SOURCE_INFO[source].fields
  const key = JSON.stringify(sheet)
  let fields = fieldCache.get(key)
  if (!fields) {
    if (fieldCache.size > 100) fieldCache.clear()
    const base = editedFields(source, sheet.fields ?? [])
    const all = [...base, ...derivedFields(base, sheet), ...calcFields(sheet, sheet.calcs ?? [])]
    fields = [...all.filter((f) => f.role === 'dimension'), ...all.filter((f) => f.role === 'measure')]
    fieldCache.set(key, fields)
  }
  return fields
}

export function fieldOf(ref: SourceRef, name: string): Field | undefined {
  return fieldsOf(ref).find((f) => f.name === name)
}

/**
 * The compiled calcs of a sheet by name, for evaluating them, and a reader for
 * renamed or retyped fields, groups, sets and bins. Sets with a condition or
 * a top rule need `rows`, the whole data source, to find their members.
 */
export function calcsOf(ref: SourceRef, rows?: Row[]): { calc(name: string): CompiledCalc | undefined; read(row: Row, name: string): Value } {
  const fields = fieldsOf(ref)
  const byName = new Map(fields.flatMap((f) => (f.calc?.compiled ? [[f.name, f.calc.compiled] as const] : [])))
  const special = new Map(fields.flatMap((f) => (f.original || f.derived ? [[f.name, f] as const] : [])))
  const dynamic = new Map<string, Set<string>>()
  const read = (row: Row, name: string): Value => {
    const f = special.get(name)
    if (!f) return row[name] ?? null
    if (f.original) return convertValue(row[f.original.name] ?? null, f.original.type, f.type)
    const d = f.derived!
    const v = read(row, d.def.field)
    if (d.kind === 'bin') return typeof v === 'number' ? binOf(v, d.def.size) : null
    const member = display(v)
    if (d.kind === 'group') return d.def.groups.find((g) => g.members.includes(member))?.name ?? (d.def.other ? 'Other' : member)
    const rule = d.def.rule
    let inSet: boolean
    if (rule.kind === 'members') inSet = rule.members.includes(member) !== (rule.exclude ?? false)
    else {
      if (!rows) throw new Error(`the set ${name} needs the data source`)
      let members = dynamic.get(name)
      if (!members) dynamic.set(name, (members = dynamicMembers(d.def, rows, read)))
      inSet = members.has(member)
    }
    return inSet ? 'In' : 'Out'
  }
  return { calc: (name) => byName.get(name), read }
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
