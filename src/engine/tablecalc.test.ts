import { describe, expect, it } from 'vitest'
import { referenceData, testDataset } from '../test/dataset'
import { EngineError } from './pills'
import { GRAND_TOTAL, SUBTOTAL, columnOf, query } from './query'
import { toVegaLite } from './render'
import { type Pill, type VizSpec, vizSpecSchema } from './spec'
import { addressing, tableCalcValues } from './tablecalc'

const data = testDataset()
const ref = referenceData()
const spec = (s: unknown): VizSpec => vizSpecSchema.parse(s)
const run = (s: unknown) => {
  const v = spec(s)
  return { v, result: query(v, data) }
}

const MINUTES: Pill = { field: 'Minutes Watched' }
const YEAR: Pill = { field: 'Start', date: { level: 'year', mode: 'part' } }
const QUARTER: Pill = { field: 'Start', date: { level: 'quarter', mode: 'part' } }
const REGION: Pill = { field: 'Region' }

/** Minutes per region and year from the reference rows. */
const minutes = new Map<string, number>()
for (const s of ref.sessions) {
  for (const k of [`${s.subscriber.country.region}|${s.start.slice(0, 4)}`, `${s.subscriber.country.region}|`, `|${s.start.slice(0, 4)}`, '|']) {
    minutes.set(k, (minutes.get(k) ?? 0) + (s.minutes ?? 0))
  }
}

describe('table calculation values', () => {
  it('follow the help’s definitions', () => {
    expect(tableCalcValues('runningTotal', [1, 2, null, 4])).toEqual([1, 3, 3, 7])
    expect(tableCalcValues('difference', [5, 8, 6])).toEqual([null, 3, -2])
    expect(tableCalcValues('percentDifference', [4, 5, -5, 5])).toEqual([null, 0.25, -2, 2])
    expect(tableCalcValues('percentOfTotal', [1, 3, null])).toEqual([0.25, 0.75, null])
    // Rank: Descending, Competition (1, 2, 2, 4).
    expect(tableCalcValues('rank', [10, 30, 30, 5])).toEqual([3, 1, 1, 4])
    // Percentile: the lowest 0%, the highest 100%.
    expect(tableCalcValues('percentile', [10, 30, 20])).toEqual([0, 1, 0.5])
    expect(tableCalcValues('movingAverage', [3, 6, 9, 12])).toEqual([3, 4.5, 6, 9])
  })

  it('address the dimensions Compute Using names, slowest first', () => {
    const across = ['Year', 'Quarter']
    const down = ['Region']
    expect(addressing('tableAcross', across, down)).toEqual(['Year', 'Quarter'])
    expect(addressing('tableDown', across, down)).toEqual(['Region'])
    expect(addressing('tableAcrossDown', across, down)).toEqual(['Region', 'Year', 'Quarter'])
    expect(addressing('paneDown', across, down)).toEqual(['Region'])
    expect(addressing('paneDownAcross', across, down)).toEqual(['Quarter', 'Region'])
    expect(addressing('cell', across, down)).toEqual([])
  })
})

describe('quick table calculations in a query', () => {
  const crosstab = (tableCalc: Pill['tableCalc']) => run({ columns: [YEAR], rows: [REGION], marks: { label: { ...MINUTES, tableCalc } } })

  it('run across by default when Columns has a dimension, restarting per row', () => {
    const { v, result } = crosstab({ type: 'runningTotal' })
    const region = columnOf(result, v, REGION)
    const year = columnOf(result, v, YEAR)
    const m = columnOf(result, v, v.marks.label!)
    for (const r of result.rows) {
      const k = `${r[region.id]}|`
      const expected = r[year.id] === '2024' ? minutes.get(`${k.slice(0, -1)}|2024`) : minutes.get(k)
      expect(r[m.id]).toBeCloseTo(expected!, 6)
    }
  })

  it('run down when nothing is across, and Percent of total formats as a percentage', () => {
    const { v, result } = run({ columns: [{ ...MINUTES, tableCalc: { type: 'percentOfTotal' } }], rows: [REGION] })
    const region = columnOf(result, v, REGION)
    const m = columnOf(result, v, v.columns[0]!)
    expect(m.field.format?.kind).toBe('percent')
    for (const r of result.rows) expect(r[m.id]).toBeCloseTo(minutes.get(`${r[region.id]}|`)! / minutes.get('|')!, 9)
  })

  it('give each mark its own partition with Cell, and rank down with Table (down)', () => {
    const cell = crosstab({ type: 'percentOfTotal', compute: 'cell' })
    const m = columnOf(cell.result, cell.v, cell.v.marks.label!)
    expect(cell.result.rows.every((r) => r[m.id] === 1)).toBe(true)
    const ranked = crosstab({ type: 'rank', compute: 'tableDown' })
    const rk = columnOf(ranked.result, ranked.v, ranked.v.marks.label!)
    const region = columnOf(ranked.result, ranked.v, REGION)
    const year = columnOf(ranked.result, ranked.v, YEAR)
    const r2025 = ranked.result.rows.filter((r) => r[year.id] === '2025')
    const top = r2025.find((r) => r[rk.id] === 1)!
    const best = Math.max(...r2025.map((r) => minutes.get(`${r[region.id]}|2025`)!))
    expect(minutes.get(`${top[region.id]}|2025`)).toBe(best)
  })

  it('keep the plain measure as its own column next to the calculated one', () => {
    const { v, result } = run({ columns: [YEAR], rows: [MINUTES], marks: { label: { ...MINUTES, tableCalc: { type: 'difference' } } } })
    const plain = columnOf(result, v, MINUTES)
    const diff = columnOf(result, v, v.marks.label!)
    expect(plain.id).not.toBe(diff.id)
    const [y24, y25] = result.rows
    expect(y24![diff.id]).toBeNull()
    expect(y25![diff.id]).toBeCloseTo((y25![plain.id] as number) - (y24![plain.id] as number), 6)
  })

  it('need a measure', () => {
    expect(() => run({ rows: [{ ...REGION, tableCalc: { type: 'rank' } }] })).toThrow(EngineError)
  })
})

describe('totals', () => {
  it('add a Grand Total column (row totals) and row (column totals) from the underlying rows', () => {
    const { v, result } = run({ columns: [YEAR], rows: [REGION], marks: { label: MINUTES }, totals: { row: true, column: true } })
    const region = columnOf(result, v, REGION)
    const year = columnOf(result, v, YEAR)
    const m = columnOf(result, v, MINUTES)
    expect(year.order!.at(-1)).toBe(GRAND_TOTAL)
    expect(region.order!.at(-1)).toBe(GRAND_TOTAL)
    const key = (r: (typeof result.rows)[number]) => `${r[region.id] === GRAND_TOTAL ? '' : r[region.id]}|${r[year.id] === GRAND_TOTAL ? '' : r[year.id]}`
    expect(result.rows).toHaveLength(minutes.size)
    for (const r of result.rows) expect(r[m.id]).toBeCloseTo(minutes.get(key(r))!, 6)
  })

  it('compute Automatic totals of an average from the rows, and Total All Using from the marks', () => {
    const avg = { ...MINUTES, agg: 'avg' as const }
    const auto = run({ rows: [REGION], marks: { label: avg }, totals: { column: true } }).result
    const all = ref.sessions.filter((s) => s.minutes !== null).map((s) => s.minutes!)
    expect(auto.rows.at(-1)!['c1']).toBeCloseTo(all.reduce((a, b) => a + b, 0) / all.length, 9)
    const twoPass = run({ rows: [REGION], marks: { label: avg }, totals: { column: true, using: 'avg' } }).result
    const marks = twoPass.rows.slice(0, -1).map((r) => r['c1'] as number)
    expect(twoPass.rows.at(-1)!['c1']).toBeCloseTo(marks.reduce((a, b) => a + b, 0) / marks.length, 9)
  })

  it('add subtotals for outer headers', () => {
    const { v, result } = run({ columns: [YEAR, QUARTER], rows: [MINUTES], totals: { subtotals: true } })
    const year = columnOf(result, v, YEAR)
    const quarter = columnOf(result, v, QUARTER)
    expect(quarter.order).toEqual(['Q1', 'Q2', 'Q3', 'Q4', SUBTOTAL])
    const t24 = result.rows.find((r) => r[year.id] === '2024' && r[quarter.id] === SUBTOTAL)!
    expect(t24['c2']).toBeCloseTo(minutes.get('|2024')!, 6)
    expect(() => toVegaLite(v, result)).not.toThrow()
  })

  it('skip a shelf without discrete headers, and leave table calculations without a total', () => {
    const { result } = run({ columns: [{ field: 'Start', date: { level: 'month', mode: 'value' } }], rows: [MINUTES], totals: { row: true } })
    expect(result.rows).toHaveLength(24)
    const calc = run({ rows: [REGION], marks: { label: { ...MINUTES, tableCalc: { type: 'rank' } } }, totals: { column: true } }).result
    expect(calc.rows.at(-1)!['c1']).toBeNull()
  })
})
