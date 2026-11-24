// Spec edits the sandbox makes (PLAN.md §7a): dropping fields on shelves,
// moving and changing pills, filters and the mark type. Pure functions over a
// VizSpec, no data, so they are tested without the dataset or a browser.
import { fieldOf, fieldsOf, type SourceRef } from './model.ts'
import { EngineError, resolvePill } from './pills.ts'
import {
  type Aggregation,
  type Bin,
  type Calc,
  type DateLevel,
  type FieldEdit,
  type Filter,
  type Group,
  MEASURE_NAMES,
  MEASURE_VALUES,
  type MarkType,
  type Pill,
  type SetDef,
  type SourceId,
  type VizSpec,
  pillsOf,
  vizSpecSchema,
} from './spec.ts'

/** Shelves that hold a list of pills; `measureValues` is the Measure Values card. */
export const LIST_SHELVES = ['columns', 'rows', 'detail', 'tooltip', 'measureValues'] as const
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
  measureValues: 'Measure Values',
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
  return shelf === 'columns' || shelf === 'rows' || shelf === 'measureValues' ? spec[shelf] : spec.marks[shelf]
}

function withList(spec: VizSpec, shelf: ListShelf, pills: Pill[]): VizSpec {
  if (shelf === 'columns' || shelf === 'rows' || shelf === 'measureValues') return { ...spec, [shelf]: pills }
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
export function aggregationChoices(source: SourceRef, pill: Pill): (Aggregation | undefined)[] {
  const field = fieldOf(source, pill.field)
  if (!field || field.generated || field.special || field.calc?.error || field.calc?.compiled?.aggregate) return []
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
export function canToggleContinuity(source: SourceRef, pill: Pill): boolean {
  const rp = resolvePill(source, pill)
  if (rp.field.generated) return false
  if (rp.date) return true
  if (rp.agg) return rp.field.type === 'number' || rp.agg === 'count' || rp.agg === 'countd'
  return rp.field.type === 'number'
}

export function withContinuity(source: SourceRef, pill: Pill, continuous: boolean): Pill {
  const { as: _as, sort, ...rest } = pill
  const byDefault = resolvePill(source, rest).continuous
  return { ...rest, ...(byDefault !== continuous && { as: continuous ? 'continuous' : 'discrete' }), ...(!continuous && sort && { sort }) }
}

/** The filter Tableau would start from when a field is dropped on Filters, before the learner picks members or a range. */
export function defaultFilter(source: SourceRef, name: string): Filter | undefined {
  const field = fieldOf(source, name)
  if (!field || field.generated || field.calc?.error || field.special === 'values') return undefined
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

// ---- calculated fields ----

/** Applies `fn` to every pill, wherever it sits; `undefined` removes the pill. */
function mapPills(spec: VizSpec, fn: (p: Pill) => Pill | undefined): VizSpec {
  const list = (ps: Pill[]) => ps.map(fn).filter((p): p is Pill => p !== undefined)
  const one = (p: Pill | undefined) => (p ? fn(p) : undefined)
  const { marks } = spec
  return {
    ...spec,
    columns: list(spec.columns),
    rows: list(spec.rows),
    measureValues: list(spec.measureValues),
    marks: { ...marks, color: one(marks.color), size: one(marks.size), label: one(marks.label), shape: one(marks.shape), detail: list(marks.detail), tooltip: list(marks.tooltip) },
  }
}

const fieldRef = (name: string) => `[${name.replace(/]/g, ']]')}]`

/** Renames a field wherever the sheet uses it: pills, filters, sorts (default ones too) and formulas, as Tableau does. */
function renameRefs(spec: VizSpec, old: string, name: string): VizSpec {
  if (old === name) return spec
  const rename = (n: string) => (n === old ? name : n)
  const renamed = mapPills(spec, (p) => ({ ...p, field: rename(p.field), ...(p.sort && { sort: { ...p.sort, ...(p.sort.field && { field: rename(p.sort.field) }) } }) }))
  return {
    ...renamed,
    calcs: spec.calcs.map((c) => ({ ...c, formula: c.formula.split(fieldRef(old)).join(fieldRef(name)) })),
    fields: spec.fields.map((e) => (e.sort?.field === old ? { ...e, sort: { ...e.sort, field: name } } : e)),
    groups: spec.groups.map((g) => ({ ...g, name: rename(g.name), field: rename(g.field) })),
    sets: spec.sets.map((x) => ({ ...x, name: rename(x.name), field: rename(x.field), rule: x.rule.kind === 'members' ? x.rule : { ...x.rule, field: rename(x.rule.field) } })),
    bins: spec.bins.map((b) => ({ ...b, name: rename(b.name), field: rename(b.field) })),
    hierarchies: spec.hierarchies.map((h) => ({ ...h, fields: h.fields.map(rename) })),
    filters: spec.filters.map((f) => ({ ...f, field: rename(f.field) })),
  }
}

/** Takes a field off the sheet: its pills, filters and hierarchy place go; sorts by it go back to the default. */
function dropRefs(spec: VizSpec, name: string): VizSpec {
  const cleared = mapPills(spec, (p) => {
    if (p.field === name) return undefined
    if (p.sort?.field !== name) return p
    const { sort: _sort, ...rest } = p
    return rest
  })
  return {
    ...cleared,
    filters: spec.filters.filter((f) => f.field !== name),
    hierarchies: spec.hierarchies.map((h) => ({ ...h, fields: h.fields.filter((f) => f !== name) })).filter((h) => h.fields.length > 0),
  }
}

/**
 * Adds a calc (at `index` undefined) or replaces one. Renaming a calc renames
 * the pills, filters, sorts and formulas that use it.
 */
export function setCalc(spec: VizSpec, index: number | undefined, calc: Calc): VizSpec {
  if (index === undefined) return { ...spec, calcs: [...spec.calcs, calc] }
  const old = spec.calcs[index]!.name
  const renamed = renameRefs(spec, old, calc.name)
  return { ...renamed, calcs: renamed.calcs.map((c, i) => (i === index ? calc : c)) }
}

/** Removes a calc with the pills and filters on it; sorts by it go back to the default. */
export function removeCalc(spec: VizSpec, name: string): VizSpec {
  return { ...dropRefs(spec, name), calcs: spec.calcs.filter((c) => c.name !== name) }
}

// ---- several measures: combined and dual axes ----

/** The continuous pills on Columns or Rows: one is an axis, more are measure panes or a dual axis. */
export const continuousOn = (spec: VizSpec, shelf: 'columns' | 'rows'): Pill[] => spec[shelf].filter((p) => resolvePill(spec, p).continuous)

/**
 * Drops a measure onto the axis of Columns or Rows (a combined axis): the
 * axis becomes Measure Values, its measure and the new one go on the Measure
 * Values card, and Measure Names goes on Color when Color is free. On an
 * axis that already shows Measure Values, the measure joins the card.
 */
export function combineOnAxis(spec: VizSpec, shelf: 'columns' | 'rows', field: string): VizSpec {
  const axis = spec[shelf].findIndex((p) => resolvePill(spec, p).continuous)
  if (axis < 0) throw new EngineError(`There is no axis on ${SHELF_LABEL[shelf]} to drop ${field} on.`)
  const added = { field }
  if (resolvePill(spec, added).kind !== 'measure') throw new EngineError(`Only measures share an axis: ${field} is a dimension.`)
  const pill = spec[shelf][axis]!
  if (pill.field === MEASURE_VALUES) return { ...spec, measureValues: [...spec.measureValues, added] }
  const { mark: _m, ...measure } = pill
  const next = withList(
    spec,
    shelf,
    spec[shelf].map((p, i) => (i === axis ? { field: MEASURE_VALUES } : p)),
  )
  return {
    ...next,
    measureValues: [measure, added],
    marks: next.marks.color ? next.marks : { ...next.marks, color: { field: MEASURE_NAMES } },
    axes: { ...next.axes, [shelf]: undefined },
  }
}

/** Dual Axis on the last two measures of a shelf, or back to one pane each; turning it off clears Synchronize Axis. */
export function setDualAxis(spec: VizSpec, shelf: 'columns' | 'rows', dual: boolean): VizSpec {
  return { ...spec, axes: { ...spec.axes, [shelf]: dual ? { ...spec.axes[shelf], dual: true } : undefined } }
}

export function setSyncAxis(spec: VizSpec, shelf: 'columns' | 'rows', sync: boolean): VizSpec {
  return { ...spec, axes: { ...spec.axes, [shelf]: { ...spec.axes[shelf], dual: true, ...(sync ? { sync: true } : { sync: undefined }) } } }
}

/** A measure's own mark type (its Marks card), when its shelf holds several measures. */
export function setPillMark(spec: VizSpec, at: PillAt, mark: MarkType): VizSpec {
  const { mark: _m, ...pill } = pillAt(spec, at)!
  return replacePill(spec, at, mark === 'automatic' ? pill : { ...pill, mark })
}

// ---- groups, sets, bins and hierarchies ----

export type DerivedKind = 'groups' | 'sets' | 'bins'
type DerivedDef = { groups: Group; sets: SetDef; bins: Bin }

/**
 * Adds a group, set or bin (at `index` undefined) or replaces one; a new name
 * follows through the sheet. Throws an EngineError when the name is taken.
 */
export function setDerived<K extends DerivedKind>(spec: VizSpec, kind: K, index: number | undefined, def: DerivedDef[K]): VizSpec {
  const list = spec[kind] as DerivedDef[K][]
  const old = index === undefined ? undefined : list[index]!.name
  if (def.name !== old && fieldsOf(spec).some((f) => f.name === def.name)) throw new EngineError(`There is already a field called ${def.name}. Choose another name.`)
  const renamed = old === undefined ? spec : renameRefs(spec, old, def.name)
  const next = index === undefined ? [...list, def] : (renamed[kind] as DerivedDef[K][]).map((d, i) => (i === index ? def : d))
  return { ...renamed, [kind]: next }
}

/** Removes a group, set or bin with its pills, filters and hierarchy place. */
export function removeDerived(spec: VizSpec, name: string): VizSpec {
  const cleared = dropRefs(spec, name)
  return { ...cleared, groups: spec.groups.filter((g) => g.name !== name), sets: spec.sets.filter((x) => x.name !== name), bins: spec.bins.filter((b) => b.name !== name) }
}

/** The hierarchy a field is in, if any. */
export const hierarchyOf = (spec: VizSpec, field: string) => spec.hierarchies.find((h) => h.fields.includes(field))

/** A new hierarchy of `fields` (general to detailed); each leaves any hierarchy it was in. Throws when the name is taken. */
export function createHierarchy(spec: VizSpec, name: string, fields: string[]): VizSpec {
  if (spec.hierarchies.some((h) => h.name === name) || fieldsOf(spec).some((f) => f.name === name)) throw new EngineError(`There is already a field or hierarchy called ${name}. Choose another name.`)
  const rest = spec.hierarchies.map((h) => ({ ...h, fields: h.fields.filter((f) => !fields.includes(f)) })).filter((h) => h.fields.length > 0)
  return { ...spec, hierarchies: [...rest, { name, fields }] }
}

/** Adds a field to the end of a hierarchy (or, with `before`, ahead of that field), taking it out of any other. */
export function addToHierarchy(spec: VizSpec, hierarchy: string, field: string, before?: string): VizSpec {
  const hierarchies = spec.hierarchies
    .map((h) => {
      const fields = h.fields.filter((f) => f !== field)
      if (h.name !== hierarchy) return { ...h, fields }
      const at = before ? fields.indexOf(before) : -1
      return { ...h, fields: at < 0 ? [...fields, field] : [...fields.slice(0, at), field, ...fields.slice(at)] }
    })
    .filter((h) => h.fields.length > 0)
  return { ...spec, hierarchies }
}

/** Takes a field out of its hierarchy; a hierarchy left empty goes. */
export function removeFromHierarchy(spec: VizSpec, field: string): VizSpec {
  return { ...spec, hierarchies: spec.hierarchies.map((h) => ({ ...h, fields: h.fields.filter((f) => f !== field) })).filter((h) => h.fields.length > 0) }
}

/** Removes a hierarchy; its fields stay in the Data pane. */
export function removeHierarchy(spec: VizSpec, name: string): VizSpec {
  return { ...spec, hierarchies: spec.hierarchies.filter((h) => h.name !== name) }
}

/**
 * Drilling on a list-shelf pill of a hierarchy field: `down` is the next level
 * (when it isn't on the shelf yet), `up` says whether lower levels follow it.
 */
export function drillState(spec: VizSpec, at: PillAt): { down?: string; up: boolean } {
  if (isChannel(at.shelf)) return { up: false }
  const pill = listOf(spec, at.shelf)[at.index]
  const h = pill && !pill.agg ? hierarchyOf(spec, pill.field) : undefined
  if (!h) return { up: false }
  const level = h.fields.indexOf(pill!.field)
  const onShelf = listOf(spec, at.shelf).map((p) => p.field)
  const next = h.fields[level + 1]
  return { down: next && !onShelf.includes(next) ? next : undefined, up: h.fields.slice(level + 1).some((f) => onShelf.includes(f)) }
}

/** The + on a hierarchy pill: the next level goes on the same shelf, right after it. */
export function drillDown(spec: VizSpec, at: PillAt): VizSpec {
  const next = drillState(spec, at).down
  return next ? placePill(spec, { field: next }, at.shelf, at.index + 1) : spec
}

/** The − on a hierarchy pill: the levels below it leave the shelf. */
export function drillUp(spec: VizSpec, at: PillAt): VizSpec {
  if (isChannel(at.shelf)) return spec
  const list = listOf(spec, at.shelf)
  const h = hierarchyOf(spec, list[at.index]!.field)
  if (!h) return spec
  const below = h.fields.slice(h.fields.indexOf(list[at.index]!.field) + 1)
  return withList(
    spec,
    at.shelf,
    list.filter((p) => !below.includes(p.field)),
  )
}

// ---- field edits (Data pane) ----

/** The sheet's edit of a data source field, by its data source name. */
export function fieldEdit(spec: VizSpec, original: string): FieldEdit | undefined {
  return spec.fields.find((e) => e.field === original)
}

const currentName = (spec: VizSpec, original: string) => fieldEdit(spec, original)?.name ?? original

/**
 * Changes a data source field. Keys set to `undefined` go back to the data
 * source's setting; a rename follows through the sheet. A new data type
 * clears the field's filters and its pills' date levels and sorts, which no
 * longer fit.
 */
export function editField(spec: VizSpec, original: string, patch: Partial<Omit<FieldEdit, 'field'>>): VizSpec {
  const before = currentName(spec, original)
  const merged: Record<string, unknown> = { ...fieldEdit(spec, original), ...patch, field: original }
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k]
  if (merged.name === original) delete merged.name
  const after = (merged.name as string | undefined) ?? original
  if (after !== before && fieldsOf(spec).some((f) => f.name === after))
    throw new EngineError(`There is already a field called ${after}. Choose another name.`)
  const edit = merged as FieldEdit
  const empty = Object.keys(edit).length === 1
  let next: VizSpec = { ...spec, fields: empty ? spec.fields.filter((e) => e.field !== original) : [...spec.fields.filter((e) => e.field !== original), edit] }
  next = renameRefs(next, before, after)
  if ('type' in patch) {
    next = mapPills(next, (p) => {
      if (p.field !== after) return p
      const { date: _d, sort: _s, ...rest } = p
      return rest
    })
    next = { ...next, filters: next.filters.filter((f) => f.field !== after) }
  }
  return next
}

/** Undoes every change to a field (a sandbox shortcut, not a Tableau command). */
export function resetField(spec: VizSpec, original: string): VizSpec {
  const edit = fieldEdit(spec, original)
  if (!edit) return spec
  const keys = Object.fromEntries(Object.keys(edit).filter((k) => k !== 'field').map((k) => [k, undefined]))
  return editField(spec, original, keys)
}

/** Whether the view uses a field: on a shelf, in a filter or in a sort. */
export function usesField(spec: VizSpec, name: string): boolean {
  return [...pillsOf(spec), ...spec.measureValues].some((p) => p.field === name || p.sort?.field === name) || spec.filters.some((f) => f.field === name)
}

// ---- the spec in the URL (#spec=…) ----

/** The spec without defaults, so links stay short. */
export function compactSpec(spec: VizSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (spec.source !== 'sessions') out.source = spec.source
  if (spec.calcs.length) out.calcs = spec.calcs
  if (spec.fields.length) out.fields = spec.fields
  for (const k of ['groups', 'sets', 'bins', 'hierarchies', 'measureValues'] as const) if (spec[k].length) out[k] = spec[k]
  if (spec.axes.columns || spec.axes.rows) out.axes = spec.axes
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
