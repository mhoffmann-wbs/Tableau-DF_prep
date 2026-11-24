// Every chart type the outline asks for compiles with Vega-Lite and renders to
// SVG headlessly. The Automatic mark follows Tableau's defaults.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { View, parse } from 'vega'
import { compile } from 'vega-lite'
import { describe, expect, it } from 'vitest'
import { testDataset } from '../test/dataset'
import { EngineError } from './pills'
import { query } from './query'
import { type Topology, automaticMark, toVegaLite } from './render'
import { vizSpecSchema } from './spec'

const data = testDataset()
const world = JSON.parse(readFileSync(join(import.meta.dirname, '../../node_modules/world-atlas/countries-110m.json'), 'utf8')) as Topology

function build(s: unknown) {
  const spec = vizSpecSchema.parse(s)
  const result = query(spec, data)
  return { spec, result, vl: toVegaLite(spec, result, { world }) }
}

async function svgOf(s: unknown) {
  const view = new View(parse(compile(build(s).vl).spec), { renderer: 'none' })
  return view.toSVG()
}

const month = { field: 'Start', date: { level: 'month', mode: 'value' } }
const CHARTS: [string, unknown][] = [
  ['bar chart (2.1.1)', { rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] }],
  ['line chart (2.1.2)', { columns: [month], rows: [{ field: 'Minutes Watched' }] }],
  ['scatterplot (2.1.3)', { source: 'titles', columns: [{ field: 'Runtime', agg: 'avg' }], rows: [{ field: 'Titles (Count)' }], marks: { detail: [{ field: 'Sub-Genre' }] } }],
  ['symbol map (2.1.4)', { source: 'subscribers', columns: [{ field: 'Longitude (generated)' }], rows: [{ field: 'Latitude (generated)' }], marks: { detail: [{ field: 'City' }], size: { field: 'Subscribers (Count)' } } }],
  ['filled map (2.1.4)', { source: 'subscribers', columns: [{ field: 'Longitude (generated)' }], rows: [{ field: 'Latitude (generated)' }], marks: { type: 'map', detail: [{ field: 'Country' }], color: { field: 'Subscribers (Count)' } } }],
  ['stacked bar (2.1.7)', { columns: [{ field: 'Region' }], rows: [{ field: 'Minutes Watched' }], marks: { color: { field: 'Device' } } }],
  ['density map (2.1.8)', { source: 'subscribers', columns: [{ field: 'Longitude' }], rows: [{ field: 'Latitude' }], marks: { type: 'density', detail: [{ field: 'Subscriber ID' }] } }],
  ['crosstab (2.1.9)', { columns: [{ field: 'Start', date: { level: 'year', mode: 'part' } }], rows: [{ field: 'Region' }], marks: { label: { field: 'Minutes Watched' } } }],
  ['highlight table (2.1.9)', { columns: [{ field: 'Start', date: { level: 'weekday', mode: 'part' } }], rows: [{ field: 'Device' }], marks: { type: 'square', color: { field: 'Sessions (Count)' }, label: { field: 'Sessions (Count)' } } }],
  ['nested headers', { columns: [{ field: 'Start', date: { level: 'year', mode: 'part' } }, { field: 'Start', date: { level: 'quarter', mode: 'part' } }], rows: [{ field: 'Minutes Watched' }] }],
  ['panes on both shelves', { columns: [{ field: 'Type' }, { field: 'Minutes Watched' }], rows: [{ field: 'Region' }, { field: 'Device' }] }],
  ['labelled bars', { rows: [{ field: 'Plan' }], columns: [{ field: 'Subscriber ID', agg: 'countd' }], marks: { label: { field: 'Subscriber ID', agg: 'countd' } } }],
  ['combined axis (2.1.5)', { columns: [month], rows: [{ field: 'Measure Values' }], measureValues: [{ field: 'Minutes Watched', agg: 'avg' }, { field: 'Runtime', agg: 'avg' }], marks: { color: { field: 'Measure Names' } } }],
  ['measure panes', { columns: [month], rows: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)', mark: 'bar' }] }],
  ['dual axis (2.1.6)', { columns: [month], rows: [{ field: 'Minutes Watched', mark: 'bar' }, { field: 'Sessions (Count)', mark: 'line' }], axes: { rows: { dual: true } } }],
  ['dual axis, synchronized, in panes', { columns: [{ field: 'Region' }, month], rows: [{ field: 'Minutes Watched' }, { field: 'Minutes Watched', agg: 'avg' }], axes: { rows: { dual: true, sync: true } } }],
  ['table of measures', { rows: [{ field: 'Genre' }], columns: [{ field: 'Measure Names' }], measureValues: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }], marks: { label: { field: 'Measure Values' } } }],
]

describe('render', () => {
  it.each(CHARTS)('renders a %s', async (_, s) => {
    const svg = await svgOf(s)
    expect(svg).toMatch(/^<svg/)
    expect(svg.length).toBeGreaterThan(1000)
  })

  it('picks Tableau’s automatic marks', () => {
    const marks = (s: unknown) => {
      const { result, spec } = build(s)
      const at = (shelf: 'columns' | 'rows') => result.columns.find((c) => spec[shelf].length && c.pill === spec[shelf].at(-1))
      return automaticMark(at('columns'), at('rows'))
    }
    expect(marks(CHARTS[0]![1])).toBe('bar')
    expect(marks(CHARTS[1]![1])).toBe('line')
    // Measures as the inner fields of both shelves: Shape.
    expect(marks(CHARTS[2]![1])).toBe('shape')
    expect(marks(CHARTS[7]![1])).toBe('text')
    // A date field and a measure draw a line, whether the date is a part (discrete) or a value.
    expect(marks({ columns: [{ field: 'Start', date: { level: 'month', mode: 'part' } }], rows: [{ field: 'Minutes Watched' }] })).toBe('line')
    expect(marks({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] })).toBe('bar')
  })

  it('splits the view into panes for discrete pills before the axis', () => {
    const vl = build(CHARTS[9]![1]).vl as { facet?: { column?: { field: string } } }
    expect(vl.facet?.column).toBeTruthy()
  })

  it('gives each measure its own axis: panes, or a dual axis with one scale per axis unless synchronized', () => {
    type Layered = { facet?: unknown; resolve?: { scale: Record<string, string>; axis?: Record<string, string> }; spec?: Layered; layer?: { mark: { type: string; color?: string } }[] }
    const panes = build(CHARTS.find(([n]) => n === 'measure panes')![1]).vl as Layered
    expect(panes.facet).toBeTruthy()
    expect(panes.resolve).toEqual({ scale: { y: 'independent' } })
    // Each measure has its own Marks card: SUM(Minutes Watched) stays Automatic (Line), the count draws bars.
    expect(panes.spec!.layer!.map((l) => l.mark.type).sort()).toEqual(['bar', 'line'])
    const dual = build(CHARTS.find(([n]) => n === 'dual axis (2.1.6)')![1]).vl as Layered
    expect(dual.facet).toBeUndefined()
    expect((dual as { height?: number }).height).toBe(260)
    expect(dual.resolve).toEqual({ scale: { y: 'independent' }, axis: { y: 'independent' } })
    expect(dual.layer!.map((l) => [l.mark.type, l.mark.color])).toEqual([
      ['bar', '#4e79a7'],
      ['line', '#f28e2b'],
    ])
    const sync = build(CHARTS.find(([n]) => n === 'dual axis, synchronized, in panes')![1]).vl as Layered
    expect(sync.spec!.resolve).toEqual({ scale: { y: 'shared' }, axis: { y: 'independent' } })
  })

  it('explains shelf setups it can’t draw', () => {
    expect(() => build({ columns: [month, { field: 'Runtime' }], rows: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }] })).toThrow(/both Columns and Rows/)
    expect(() => build({ columns: [month], rows: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }, { field: 'Runtime' }], axes: { rows: { dual: true } } })).toThrow(/exactly two measures/)
    expect(() => build({ rows: [{ field: 'Measure Values' }] })).toThrow(/Measure Values card is empty/)
    expect(() => build({ rows: [{ field: 'Measure Values' }], measureValues: [{ field: 'Genre' }] })).toThrow(/holds measures/)
    expect(() => build({ columns: [{ field: 'Minutes Watched' }, { field: 'Genre' }] })).toThrow(EngineError)
    expect(() => build({ rows: [{ field: 'Genre' }], marks: { type: 'map' } })).toThrow('A map needs Longitude on Columns and Latitude on Rows.')
  })
})
