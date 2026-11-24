import { describe, expect, it } from 'vitest'
import { referenceData, testDataset } from '../test/dataset'
import { EngineError } from './pills'
import { columnOf, datePart, dateTrunc, partFromLabel, query } from './query'
import { type VizSpec, vizSpecSchema } from './spec'

const data = testDataset()
const ref = referenceData()
const spec = (s: unknown): VizSpec => vizSpecSchema.parse(s)
const run = (s: unknown) => {
  const v = spec(s)
  return { v, result: query(v, data) }
}
/** Rows as {dimension member: measure value}, for a view with one of each. */
const pairs = (s: unknown) => {
  const { result } = run(s)
  const d = result.columns.find((c) => c.kind === 'dimension')!
  const m = result.columns.find((c) => c.kind === 'measure')!
  return Object.fromEntries(result.rows.map((r) => [String(r[d.id]), r[m.id]]))
}
const sumBy = <T>(xs: T[], key: (x: T) => string, value: (x: T) => number) => {
  const m: Record<string, number> = {}
  for (const x of xs) m[key(x)] = (m[key(x)] ?? 0) + value(x)
  return m
}

describe('dates', () => {
  it('computes parts and truncations in UTC, weeks starting on Sunday', () => {
    const ms = Date.UTC(2025, 7, 14, 21, 5) // Thursday 14 August 2025
    expect([datePart(ms, 'year'), datePart(ms, 'quarter'), datePart(ms, 'month'), datePart(ms, 'day'), datePart(ms, 'weekday')]).toEqual([2025, 3, 8, 14, 5])
    expect(datePart(Date.UTC(2025, 0, 4), 'week')).toBe(1) // Sat 4 Jan: still week 1
    expect(datePart(Date.UTC(2025, 0, 5), 'week')).toBe(2) // Sun 5 Jan starts week 2
    expect(dateTrunc(ms, 'quarter')).toBe(Date.UTC(2025, 6, 1))
    expect(dateTrunc(ms, 'week')).toBe(Date.UTC(2025, 7, 10))
  })
})

describe('date part labels', () => {
  it('map back to the canonical numbers datePart filters store', () => {
    expect([partFromLabel('2025', 'year'), partFromLabel('Q3', 'quarter'), partFromLabel('March', 'month'), partFromLabel('Sunday', 'weekday'), partFromLabel('17', 'day')]).toEqual([2025, 3, 3, 1, 17])
  })
})

describe('query', () => {
  it('aggregates a measure per dimension member', () => {
    const got = pairs({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] })
    expect(got).toEqual(sumBy(ref.sessions, (s) => s.title.genre, (s) => s.minutes ?? 0))
  })

  it('collapses to one mark without dimensions, and the total splits across members (4.3.2)', () => {
    const { result } = run({ columns: [{ field: 'Minutes Watched' }] })
    expect(result.rows).toHaveLength(1)
    const total = result.rows[0]!['c0'] as number
    const byGenre = pairs({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] })
    expect(Object.values(byGenre).reduce((a, b) => (a as number) + (b as number), 0)).toBe(total)
  })

  it('counts distinct subscribers per region and year part', () => {
    const { v, result } = run({
      columns: [{ field: 'Start', date: { level: 'year', mode: 'part' } }],
      rows: [{ field: 'Region' }],
      marks: { label: { field: 'Subscriber ID', agg: 'countd' } },
    })
    const region = columnOf(result, v.source, v.rows[0]!)
    const year = columnOf(result, v.source, v.columns[0]!)
    const n = columnOf(result, v.source, v.marks.label!)
    expect(n.label).toBe('CNTD(Subscriber ID)')
    const expected = new Map<string, Set<string>>()
    for (const s of ref.sessions) {
      const k = `${s.subscriber.country.region}|${s.start.slice(0, 4)}`
      expected.set(k, (expected.get(k) ?? new Set()).add(s.subscriber.id))
    }
    expect(result.rows).toHaveLength(expected.size)
    for (const r of result.rows) expect(r[n.id]).toBe(expected.get(`${r[region.id]}|${r[year.id]}`)!.size)
  })

  it('makes a continuous date value an axis of epoch ms, and a discrete part a list of labels', () => {
    const value = run({ columns: [{ field: 'Start', date: { level: 'month', mode: 'value' } }], rows: [{ field: 'Minutes Watched' }] }).result
    expect(value.rows).toHaveLength(24)
    expect(value.rows[0]!['c0']).toBe(Date.UTC(2024, 0, 1))
    expect(value.columns[0]!.continuous).toBe(true)
    const part = run({ columns: [{ field: 'Start', date: { level: 'month', mode: 'part' } }], rows: [{ field: 'Minutes Watched' }] }).result
    expect(part.rows).toHaveLength(12)
    expect(part.columns[0]!.order).toEqual(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])
    const weekday = run({ columns: [{ field: 'Start', date: { level: 'weekday', mode: 'part' } }] }).result
    expect(weekday.columns[0]!.order![0]).toBe('Sunday')
  })

  it('applies dimension, date-part and measure filters', () => {
    const got = run({
      columns: [{ field: 'Minutes Watched' }],
      filters: [
        { kind: 'values', field: 'Device', values: ['Mobile'] },
        { kind: 'datePart', field: 'Start', level: 'year', values: [2025] },
        { kind: 'datePart', field: 'Start', level: 'quarter', values: [3] },
      ],
    }).result.rows[0]!['c0']
    const expected = ref.sessions
      .filter((s) => s.device === 'Mobile' && s.start.startsWith('2025') && ['07', '08', '09'].includes(s.start.slice(5, 7)))
      .reduce((a, s) => a + (s.minutes ?? 0), 0)
    expect(got).toBe(expected)

    const all = pairs({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] }) as Record<string, number>
    const cut = 500_000
    const kept = pairs({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }], filters: [{ kind: 'range', field: 'Minutes Watched', agg: 'sum', min: cut }] })
    expect(Object.keys(kept).sort()).toEqual(Object.keys(all).filter((g) => all[g]! >= cut).sort())
  })

  it('shows nulls as a Null member, and aggregations skip them', () => {
    const devices = run({ rows: [{ field: 'Device' }] }).result.columns[0]!.order!
    expect(devices.at(-1)).toBe('Null')
    const { result } = run({
      columns: [
        { field: 'Minutes Watched', agg: 'count' },
        { field: 'Minutes Watched', agg: 'avg' },
      ],
    })
    const present = ref.sessions.filter((s) => s.minutes !== null)
    expect(result.rows[0]!['c0']).toBe(present.length)
    expect(result.rows[0]!['c1']).toBeCloseTo(present.reduce((a, s) => a + s.minutes!, 0) / present.length, 9)
  })

  it('sorts members by a measure, descending, or manually', () => {
    const totals = sumBy(ref.sessions, (s) => s.title.genre, (s) => s.minutes ?? 0)
    const byMeasure = Object.keys(totals).sort((a, b) => totals[b]! - totals[a]!)
    const sorted = run({ rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched', agg: 'sum' } }], columns: [{ field: 'Minutes Watched' }] })
    const genre = columnOf(sorted.result, 'sessions', sorted.v.rows[0]!)
    expect(genre.order).toEqual(byMeasure)
    expect(sorted.result.rows.map((r) => r[genre.id])).toEqual(byMeasure)
    const manual = run({ rows: [{ field: 'Genre', sort: { manual: ['Thriller', 'Comedy'] } }] }).result.columns[0]!.order!
    expect(manual.slice(0, 2)).toEqual(['Thriller', 'Comedy'])
  })

  it('places generated coordinates at the finest geographic field in the view', () => {
    const { result } = run({
      source: 'subscribers',
      columns: [{ field: 'Longitude (generated)' }],
      rows: [{ field: 'Latitude (generated)' }],
      marks: { detail: [{ field: 'Country' }, { field: 'City' }] },
    })
    const munich = result.rows.find((r) => r['c3'] === 'München' || r['c3'] === 'Munich')!
    expect([munich['c1'], munich['c0']]).toEqual([48.1351, 11.582])
    expect(() => run({ columns: [{ field: 'Longitude (generated)' }] })).toThrow(EngineError)
  })

  it('explains bad specs', () => {
    expect(() => run({ rows: [{ field: 'Nope' }] })).toThrow('There is no field "Nope" in the Sessions data source.')
    expect(() => run({ rows: [{ field: 'Genre', agg: 'sum' }] })).toThrow('SUM needs a number, but Genre is a string field.')
    expect(() => run({ rows: [{ field: 'Genre', date: { level: 'year', mode: 'part' } }] })).toThrow(EngineError)
  })
})

describe('Measure Names and Measure Values', () => {
  it('unpivot: one row per mark and measure, in card order, filtered by Measure Names', () => {
    const view = {
      rows: [{ field: 'Device' }],
      columns: [{ field: 'Measure Values' }],
      marks: { color: { field: 'Measure Names' } },
      measureValues: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }],
    }
    const { v, result } = run(view)
    const device = columnOf(result, v, { field: 'Device' })
    const names = columnOf(result, v, { field: 'Measure Names' })
    const values = columnOf(result, v, { field: 'Measure Values' })
    expect(names.order).toEqual(['SUM(Minutes Watched)', 'SUM(Sessions (Count))'])
    const got = Object.fromEntries(result.rows.map((r) => [`${r[device.id]}|${r[names.id]}`, r[values.id]]))
    const minutes = sumBy(ref.sessions, (s) => s.device || 'Null', (s) => s.minutes ?? 0)
    const sessions = sumBy(ref.sessions, (s) => s.device || 'Null', () => 1)
    for (const d of Object.keys(minutes)) {
      expect(got[`${d}|SUM(Minutes Watched)`]).toBe(minutes[d])
      expect(got[`${d}|SUM(Sessions (Count))`]).toBe(sessions[d])
    }
    expect(result.rows.length).toBe(2 * Object.keys(minutes).length)
    const filtered = run({ ...view, filters: [{ kind: 'values', field: 'Measure Names', values: ['SUM(Sessions (Count))'] }] }).result
    expect(new Set(filtered.rows.map((r) => r[names.id]))).toEqual(new Set(['SUM(Sessions (Count))']))
  })
})
