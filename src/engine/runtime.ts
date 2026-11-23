// The heavy half of <Viz>: dataset, query, Vega-Lite and the world map. Loaded
// with a dynamic import, so pages without charts never download it.
import embed from 'vega-embed'
import { loadDataset } from './model'
import { partFromLabel, query } from './query'
import { type Theme, type Topology, needsWorld, toVegaLite } from './render'
import { type Pill, type SourceId, type VizSpec, vizSpecSchema } from './spec'

let world: Promise<Topology> | undefined

/** Draws the spec into `el`; resolves to a cleanup function. */
export async function renderViz(el: HTMLElement, spec: VizSpec, theme: Theme): Promise<() => void> {
  const map = needsWorld(spec)
  if (map) world ??= import('world-atlas/countries-110m.json').then((m) => m.default as unknown as Topology)
  const [data, topology] = await Promise.all([loadDataset(), map ? world : undefined])
  const vl = toVegaLite(spec, query(spec, data!), { theme, world: topology })
  const result = await embed(el, vl, { actions: false, renderer: 'svg' })
  return () => result.finalize()
}

/** A member as a filter dialog lists it: date parts carry their canonical number for `datePart` filters. */
export interface Member {
  label: string
  value: string | number
}

/** The members a discrete pill shows, in display order. */
export async function membersOf(source: SourceId, pill: Pill): Promise<Member[]> {
  const result = query(vizSpecSchema.parse({ source, rows: [pill] }), await loadDataset())
  const level = pill.date?.mode === 'part' ? pill.date.level : undefined
  return (result.columns[0]?.order ?? [])
    .filter((m) => !(level && m === 'Null'))
    .map((m) => ({ label: m, value: level ? partFromLabel(m, level) : m }))
}
