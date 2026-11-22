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
    expect(marks(CHARTS[2]![1])).toBe('circle')
    expect(marks(CHARTS[7]![1])).toBe('text')
    // A date part is discrete, so the same measure over MONTH parts draws bars.
    expect(marks({ columns: [{ field: 'Start', date: { level: 'month', mode: 'part' } }], rows: [{ field: 'Minutes Watched' }] })).toBe('bar')
  })

  it('splits the view into panes for discrete pills before the axis', () => {
    const vl = build(CHARTS[9]![1]).vl as { facet?: { column?: { field: string } } }
    expect(vl.facet?.column).toBeTruthy()
  })

  it('explains shelf setups it can’t draw', () => {
    expect(() => build({ columns: [{ field: 'Minutes Watched' }, { field: 'Genre' }] })).toThrow(EngineError)
    expect(() => build({ rows: [{ field: 'Genre' }], marks: { type: 'map' } })).toThrow('A map needs Longitude on Columns and Latitude on Rows.')
  })
})
