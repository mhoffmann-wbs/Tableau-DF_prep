// Spec edits the sandbox makes (PLAN.md §7a): dropping fields on shelves,
// moving and changing pills, filters and the mark type. Pure functions over a
// VizSpec, no data, so they are tested without the dataset or a browser.
import { fieldOf } from './model.ts'
import { resolvePill } from './pills.ts'
import { type Aggregation, type DateLevel, type Filter, type MarkType, type Pill, type SourceId, type VizSpec, vizSpecSchema } from './spec.ts'

/** Shelves that hold a list of pills. */
export const LIST_SHELVES = ['columns', 'rows', 'detail', 'tooltip'] as const
/** Marks card channels that hold one pill. */
export const CHANNELS = ['color', 'size', 'label', 'shape'] as const
export type ListShelf = (typeof LIST_SHELVES)[number]
export type Channel = (typeof CHANNELS)[number]
export type ShelfId = ListShelf | Channel

export const SHELF_LABEL: Record<ShelfId, string> = {
  columns: 'Columns',
  rows: 'Rows',
  detail: 'Detail',
  tooltip: 'Tooltip',
  color: 'Color',
  size: 'Size',
  label: 'Label',
  shape: 'Shape',
}

/** Where a pill sits: a shelf, and its position on list shelves. */
export interface PillAt {
  shelf: ShelfId
  index: number
}

export const isChannel = (shelf: ShelfId): shelf is Channel => (CHANNELS as readonly string[]).includes(shelf)

export function emptySpec(source: SourceId = 'sessions'): VizSpec {
  return vizSpecSchema.parse({ source })
}

function listOf(spec: VizSpec, shelf: ListShelf): Pill[] {
  return shelf === 'columns' || shelf === 'rows' ? spec[shelf] : spec.marks[shelf]
}

function withList(spec: VizSpec, shelf: ListShelf, pills: Pill[]): VizSpec {
  if (shelf === 'columns' || shelf === 'rows') return { ...spec, [shelf]: pills }
  return { ...spec, marks: { ...spec.marks, [shelf]: pills } }
}

export function pillAt(spec: VizSpec, at: PillAt): Pill | undefined {
  return isChannel(at.shelf) ? spec.marks[at.shelf] : listOf(spec, at.shelf)[at.index]
}

/**
 * Puts a pill on a shelf. On list shelves it goes in at `index` (default: the
 * end); a Marks card channel holds one pill, so a new one replaces the old.
 */
export function placePill(spec: VizSpec, pill: Pill, shelf: ShelfId, index?: number): VizSpec {
  if (isChannel(shelf)) return { ...spec, marks: { ...spec.marks, [shelf]: pill } }
  const list = [...listOf(spec, shelf)]
  list.splice(index ?? list.length, 0, pill)
  return withList(spec, shelf, list)
}

export function removePill(spec: VizSpec, at: PillAt): VizSpec {
  if (isChannel(at.shelf)) return { ...spec, marks: { ...spec.marks, [at.shelf]: undefined } }
  return withList(
    spec,
    at.shelf,
    listOf(spec, at.shelf).filter((_, i) => i !== at.index),
  )
}

export function replacePill(spec: VizSpec, at: PillAt, pill: Pill): VizSpec {
  if (isChannel(at.shelf)) return placePill(spec, pill, at.shelf)
  return withList(
    spec,
    at.shelf,
    listOf(spec, at.shelf).map((p, i) => (i === at.index ? pill : p)),
  )
}

/** Moves a pill to another shelf or position; `index` counts positions before the move. */
export function movePill(spec: VizSpec, from: PillAt, shelf: ShelfId, index?: number): VizSpec {
  const pill = pillAt(spec, from)
  if (!pill) return spec
  let target = index
  if (target !== undefined && from.shelf === shelf && from.index < target) target -= 1
  return placePill(removePill(spec, from), pill, shelf, target)
}

/** The pill a field becomes when dropped on a shelf: its default aggregation or date level comes from the engine. */
export function pillFor(field: string): Pill {
  return { field }
}

// ---- pill menu ----

const NUMBER_AGGS: Aggregation[] = ['sum', 'avg', 'median', 'count', 'countd', 'min', 'max']
const OTHER_AGGS: Aggregation[] = ['count', 'countd', 'min', 'max', 'attr']

/**
 * The aggregations a pill's menu offers. `undefined` stands for "Dimension"
 * (not aggregated), offered for dimension fields only: the engine keeps
 * measure fields aggregated. Generated coordinates offer none.
 */
export function aggregationChoices(source: SourceId, pill: Pill): (Aggregation | undefined)[] {
  const field = fieldOf(source, pill.field)
  if (!field || field.generated) return []
  if (field.role === 'measure') return NUMBER_AGGS
  return [undefined, ...(field.type === 'number' ? NUMBER_AGGS : OTHER_AGGS)]
}

/** Changes the aggregation; date levels, sorts and discrete/continuous overrides start over. */
export function withAggregation(pill: Pill, agg: Aggregation | undefined): Pill {
  return agg ? { field: pill.field, agg } : { field: pill.field }
}

export function withDateLevel(pill: Pill, level: DateLevel, mode: 'part' | 'value'): Pill {
  const { as: _as, sort, ...rest } = pill
  // A sort by a measure still applies to the new members; a member-value sort too.
  return { ...rest, date: { level, mode }, ...(mode === 'part' && sort && { sort }) }
}

/** Whether a pill can switch between discrete and continuous: dates and numbers can, text can't. */
export function canToggleContinuity(source: SourceId, pill: Pill): boolean {
  const rp = resolvePill(source, pill)
  if (rp.field.generated) return false
  if (rp.date) return true
  if (rp.agg) return rp.field.type === 'number' || rp.agg === 'count' || rp.agg === 'countd'
  return rp.field.type === 'number'
}

export function withContinuity(source: SourceId, pill: Pill, continuous: boolean): Pill {
  const { as: _as, sort, ...rest } = pill
  const byDefault = resolvePill(source, rest).continuous
  return { ...rest, ...(byDefault !== continuous && { as: continuous ? 'continuous' : 'discrete' }), ...(!continuous && sort && { sort }) }
}

/** The filter Tableau would start from when a field is dropped on Filters, before the learner picks members or a range. */
export function defaultFilter(source: SourceId, name: string): Filter | undefined {
  const field = fieldOf(source, name)
  if (!field || field.generated) return undefined
  if (field.type === 'date' || field.type === 'datetime') return { kind: 'datePart', field: name, level: 'year', values: [] }
  if (field.role === 'measure') return { kind: 'range', field: name, agg: field.agg }
  return { kind: 'values', field: name, values: [] }
}

/** A filter is complete once it selects something; incomplete ones stay out of the spec. */
export function isCompleteFilter(f: Filter): boolean {
  if (f.kind === 'values' || f.kind === 'datePart') return f.values.length > 0
  if (f.kind === 'range') return f.min !== undefined || f.max !== undefined
  return f.from !== undefined || f.to !== undefined
}

export function setFilter(spec: VizSpec, index: number, filter: Filter): VizSpec {
  const filters = [...spec.filters]
  filters.splice(index, 1, filter)
  return { ...spec, filters }
}

export function removeFilter(spec: VizSpec, index: number): VizSpec {
  return { ...spec, filters: spec.filters.filter((_, i) => i !== index) }
}

export function setMarkType(spec: VizSpec, type: MarkType): VizSpec {
  return { ...spec, marks: { ...spec.marks, type } }
}

// ---- the spec in the URL (#spec=…) ----

/** The spec without defaults, so links stay short. */
export function compactSpec(spec: VizSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (spec.source !== 'sessions') out.source = spec.source
  if (spec.columns.length) out.columns = spec.columns
  if (spec.rows.length) out.rows = spec.rows
  const marks: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(spec.marks)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0) || (k === 'type' && v === 'automatic')) continue
    marks[k] = v
  }
  if (Object.keys(marks).length) out.marks = marks
  if (spec.filters.length) out.filters = spec.filters
  return out
}

/** The `#spec=` hash that opens this spec in the sandbox. */
export function specHash(spec: VizSpec): string {
  return `#spec=${encodeURIComponent(JSON.stringify(compactSpec(spec)))}`
}

/** Reads a `#spec=` hash: undefined when there is none, an Error when it can't be read. */
export function parseSpecHash(hash: string): VizSpec | Error | undefined {
  const m = /^#spec=(.*)$/.exec(hash)
  if (!m) return undefined
  try {
    const result = vizSpecSchema.safeParse(JSON.parse(decodeURIComponent(m[1]!)))
    return result.success ? result.data : new Error('This link’s chart setup is damaged, so the sandbox starts empty.')
  } catch {
    return new Error('This link’s chart setup is damaged, so the sandbox starts empty.')
  }
}
