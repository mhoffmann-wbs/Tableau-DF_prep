// The heavy half of <Viz>: dataset, query, Vega-Lite and the world map. Loaded
// with a dynamic import, so pages without charts never download it.
import embed from 'vega-embed'
import { loadDataset, sheetOf, type SourceRef } from './model'
import { partFromLabel, query, type QueryResult } from './query'
import { type Theme, type Topology, needsWorld, toVegaLite } from './render'
import { type Pill, type VizSpec, vizSpecSchema } from './spec'

let world: Promise<Topology> | undefined

/** The discrete dimension members of a clicked mark, by field (underlying members, before aliases). */
export type MarkMembers = { field: string; member: string }[]

/**
 * Draws the spec into `el`; resolves to a cleanup function. With `onMark`,
 * a click on a mark reports its members (an empty list for the background),
 * and whether Shift, Ctrl or ⌘ was held to add to the selection.
 */
export async function renderViz(el: HTMLElement, spec: VizSpec, theme: Theme, onMark?: (members: MarkMembers, additive: boolean) => void): Promise<() => void> {
  const map = needsWorld(spec)
  if (map) world ??= import('world-atlas/countries-110m.json').then((m) => m.default as unknown as Topology)
  const [data, topology] = await Promise.all([loadDataset(), map ? world : undefined])
  const res = query(spec, data!)
  const vl = toVegaLite(spec, res, { theme, world: topology })
  const result = await embed(el, vl, { actions: false, renderer: 'svg' })
  if (onMark) {
    const dims = res.columns.filter((c) => c.kind === 'dimension' && !c.continuous && !c.date)
    result.view.addEventListener('click', (event, item) => {
      const datum = (item?.datum ?? {}) as Record<string, unknown>
      const members = dims
        .filter((c) => c.id in datum)
        .map((c) => {
          const label = String(datum[c.id])
          const i = c.order?.indexOf(label) ?? -1
          return { field: c.field.name, member: c.raw && i >= 0 ? c.raw[i]! : label }
        })
      const e = event as MouseEvent
      onMark(members, e.shiftKey || e.ctrlKey || e.metaKey)
    })
  }
  return () => result.finalize()
}

/** A member as a filter dialog lists it: date parts carry their canonical number for `datePart` filters. */
export interface Member {
  label: string
  value: string | number
}

/**
 * The members a discrete pill shows, in display order: labels with aliases,
 * values as filters and manual sorts store them (underlying members).
 */
export async function membersOf(ref: SourceRef, pill: Pill): Promise<Member[]> {
  const result = query(vizSpecSchema.parse({ ...sheetOf(ref), rows: [pill] }), await loadDataset())
  const level = pill.date?.mode === 'part' ? pill.date.level : undefined
  const column = result.columns[0]
  return (column?.order ?? [])
    .map((m, i) => ({ label: m, value: level ? partFromLabel(m, level) : (column!.raw?.[i] ?? m) }))
    .filter((m) => !(level && m.label === 'Null'))
}

/** Runs a spec over the dataset, for components that read numbers rather than draw. */
export async function runQuery(spec: VizSpec): Promise<QueryResult> {
  return query(spec, await loadDataset())
}
