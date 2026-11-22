// The heavy half of <Viz>: dataset, query, Vega-Lite and the world map. Loaded
// with a dynamic import, so pages without charts never download it.
import embed from 'vega-embed'
import { loadDataset } from './model'
import { query } from './query'
import { type Theme, type Topology, needsWorld, toVegaLite } from './render'
import type { VizSpec } from './spec'

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
