import { View, parse } from 'vega'
import { compile } from 'vega-lite'
import { describe, expect, it } from 'vitest'
import { referenceData, testDataset } from '../test/dataset'
import { columnOf, query } from './query'
import { quantile, refValues } from './refs'
import { toVegaLite } from './render'
import { type Pill, type Ref, type VizSpec, refSchema, vizSpecSchema } from './spec'

const data = testDataset()
const ref = referenceData()
const spec = (s: unknown): VizSpec => vizSpecSchema.parse(s)
const r = (s: unknown): Ref => refSchema.parse(s)

const MINUTES: Pill = { field: 'Minutes Watched' }
const measure = { label: 'SUM(Minutes Watched)' }

describe('reference values', () => {
  const values = [10, 20, 30, 40]
  const total = () => 1000

  it('compute a line over the marks, or Total over the rows', () => {
    const line = (agg: string) => refValues(r({ kind: 'line', measure: MINUTES, scope: 'table', value: { kind: 'computed', agg } }), values, total, measure).lines[0]!.value
    expect([line('avg'), line('sum'), line('min'), line('max'), line('median'), line('total')]).toEqual([25, 100, 10, 40, 25, 1000])
    const constant = refValues(r({ kind: 'line', measure: MINUTES, scope: 'table', value: { kind: 'constant', value: 7 }, label: 'custom', custom: 'Target = <Value>' }), values, total, measure)
    expect(constant.lines).toEqual([{ value: 7, label: 'Target = 7', stroke: true }])
  })

  it('label with the computation, the value or nothing', () => {
    const avg = (label: string) => refValues(r({ kind: 'line', measure: MINUTES, scope: 'table', value: { kind: 'computed', agg: 'avg' }, label }), values, total, measure).lines[0]!.label
    expect([avg('computation'), avg('value'), avg('none')]).toEqual(['Average of SUM(Minutes Watched)', '25', undefined])
  })

  it('shade a band between two values', () => {
    const band = refValues(r({ kind: 'band', measure: MINUTES, scope: 'table', from: { kind: 'computed', agg: 'max' }, to: { kind: 'constant', value: 15 } }), values, total, measure)
    expect(band.band).toEqual([15, 40])
    expect(band.lines.every((l) => !l.stroke)).toBe(true)
  })

  it('compute distributions with R’s type 7 quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 9)
    const dist = (d: unknown) => refValues(r({ kind: 'distribution', measure: MINUTES, scope: 'table', dist: d, label: 'none' }), values, total, measure)
    expect(dist({ kind: 'percentages', values: [60, 80], agg: 'avg' }).lines.map((l) => l.value)).toEqual([15, 20])
    expect(dist({ kind: 'quantiles', n: 4 }).lines.map((l) => l.value)).toEqual([17.5, 25, 32.5])
    expect(dist({ kind: 'quantiles', n: 4 }).band).toEqual([17.5, 32.5])
    expect(dist({ kind: 'percentiles', values: [0, 100] }).band).toEqual([10, 40])
    const sd = Math.sqrt((15 ** 2 + 5 ** 2 + 5 ** 2 + 15 ** 2) / 3)
    expect(dist({ kind: 'stddev', factor: 1, sample: true }).band![1]).toBeCloseTo(25 + sd, 9)
  })
})

describe('reference items in a view', () => {
  const genre = { field: 'Genre' }
  const avgLine = (scope: string) => ({ kind: 'line', measure: MINUTES, scope, value: { kind: 'computed', agg: 'avg' } })
  const byGenre = new Map<string, number>()
  for (const s of ref.sessions) byGenre.set(s.title.genre, (byGenre.get(s.title.genre) ?? 0) + (s.minutes ?? 0))

  it('average the marks across the table', () => {
    const v = spec({ rows: [genre], columns: [MINUTES], refs: [avgLine('table')] })
    const result = query(v, data)
    const sums = [...byGenre.values()]
    expect(result.refs![0]!.scopes).toHaveLength(1)
    expect(result.refs![0]!.scopes[0]!.lines[0]!.value).toBeCloseTo(sums.reduce((a, b) => a + b, 0) / sums.length, 6)
    expect(result.refs![0]!.column).toBe(columnOf(result, v, MINUTES).id)
  })

  it('compute one per pane, and skip items whose measure left the view', () => {
    const v = spec({ columns: [{ field: 'Type' }, genre], rows: [MINUTES], refs: [avgLine('pane'), { ...avgLine('table'), measure: { field: 'Minutes Watched', agg: 'avg' } }] })
    const result = query(v, data)
    expect(result.refs).toHaveLength(1)
    const type = columnOf(result, v, { field: 'Type' })
    expect(result.refs![0]!.scopes.map((sc) => sc.members[type.id]).sort()).toEqual(type.order!.slice().sort())
  })

  const draw = async (s: unknown) => {
    const v = spec(s)
    const vl = toVegaLite(v, query(v, data))
    return new View(parse(compile(vl).spec), { renderer: 'none' }).toSVG()
  }

  it('draw lines, bands and distributions in every scope, on one or two axes', async () => {
    const month = { field: 'Start', date: { level: 'month', mode: 'value' } }
    const quartiles = { kind: 'distribution', measure: MINUTES, scope: 'pane', dist: { kind: 'quantiles', n: 4 }, label: 'none' }
    const svg = await draw({ rows: [genre], columns: [MINUTES], refs: [avgLine('table'), quartiles] })
    expect(svg).toContain('Average of SUM(Minutes Watched)')
    await draw({ columns: [{ field: 'Type' }, genre], rows: [MINUTES], refs: [avgLine('cell'), avgLine('pane')] })
    await draw({ columns: [month], rows: [MINUTES, { field: 'Sessions (Count)' }], axes: { rows: { dual: true } }, refs: [avgLine('table')] })
    await draw({ columns: [genre], rows: [MINUTES, { field: 'Sessions (Count)' }], refs: [{ ...avgLine('table'), measure: { field: 'Sessions (Count)' } }] })
  })
})
