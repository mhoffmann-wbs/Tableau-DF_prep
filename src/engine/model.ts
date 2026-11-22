// The Driftlight data model (PLAN.md §6b): field metadata and the three data
// sources the engine queries. Each source is the base table joined many-to-one
// to its lookups, so no row is duplicated and every measure keeps its grain;
// relationships vs. joins are taught by the data model simulator, not here.
//
// The metadata is the data source as it looks *after* the preparation lessons:
// Postal Code is a string with a geographic role and Release Year a discrete
// dimension. The raw CSVs (what Tableau shows first) live in public/data/.
import type { Aggregation, SourceId } from './spec.ts'

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

export function fieldOf(source: SourceId, name: string): Field | undefined {
  return SOURCE_INFO[source].fields.find((f) => f.name === name)
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
