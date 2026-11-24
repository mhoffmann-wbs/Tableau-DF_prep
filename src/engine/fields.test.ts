import { describe, expect, it } from 'vitest'
import { referenceData, testDataset } from '../test/dataset'
import { editField, parseSpecHash, placePill, resetField, setCalc, specHash } from './edit'
import { convertValue, fieldOf } from './model'
import { resolvePill } from './pills'
import { columnOf, query } from './query'
import { toVegaLite } from './render'
import { type FieldEdit, type VizSpec, vizSpecSchema } from './spec'
import { formatNumber } from './values'

const data = testDataset()
const ref = referenceData()
const spec = (s: unknown): VizSpec => vizSpecSchema.parse(s)
const withEdits = (s: unknown, fields: FieldEdit[]) => spec({ ...(s as object), fields })
/** The members of a view's first row pill, in order. */
const rowOrder = (s: VizSpec) => columnOf(query(s, data), s, s.rows[0]!)
/** Rows as {dimension member: measure value}, for a view with one of each. */
const pairs = (s: VizSpec) => {
  const result = query(s, data)
  const d = result.columns.find((c) => c.kind === 'dimension')!
  const m = result.columns.find((c) => c.kind === 'measure')!
  return Object.fromEntries(result.rows.map((r) => [String(r[d!.id]), r[m!.id]]))
}
const count = <T>(xs: T[], key: (x: T) => string) => {
  const m: Record<string, number> = {}
  for (const x of xs) m[key(x)] = (m[key(x)] ?? 0) + 1
  return m
}

describe('rename (1.3.1)', () => {
  it('shows the new name and reads the same column', () => {
    const view = { rows: [{ field: 'Plan Code' }], columns: [{ field: 'Subscribers (Count)' }], source: 'subscribers' }
    const renamed = editField(spec(view), 'Plan Code', { name: 'Plan Tier' })
    expect(renamed.rows).toEqual([{ field: 'Plan Tier' }])
    expect(resolvePill(renamed, { field: 'Plan Tier' }).label).toBe('Plan Tier')
    expect(fieldOf(renamed, 'Plan Code')).toBeUndefined()
    expect(pairs(renamed)).toEqual(pairs(spec(view)))
  })

  it('follows through filters, sorts and formulas, and resets', () => {
    let s = spec({
      calcs: [{ name: 'Long', formula: '[Minutes Watched] > 60' }],
      rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched', agg: 'sum' } }],
      columns: [{ field: 'Minutes Watched' }],
      filters: [{ kind: 'range', field: 'Minutes Watched', min: 1 }],
    })
    s = editField(s, 'Minutes Watched', { name: 'Minutes' })
    expect(s.columns[0]!.field).toBe('Minutes')
    expect(s.rows[0]!.sort!.field).toBe('Minutes')
    expect(s.filters[0]!.field).toBe('Minutes')
    expect(s.calcs[0]!.formula).toBe('[Minutes] > 60')
    expect(fieldOf(s, 'Long')!.calc!.error).toBeUndefined()
    expect(() => query(s, data)).not.toThrow()
    const back = resetField(s, 'Minutes Watched')
    expect(back.fields).toEqual([])
    expect(back.calcs[0]!.formula).toBe('[Minutes Watched] > 60')
  })

  it('refuses a name another field has', () => {
    expect(() => editField(spec({}), 'Genre', { name: 'Device' })).toThrow(/already a field called Device/)
  })

  it('renames calcs through the same path', () => {
    const s = setCalc(spec({ calcs: [{ name: 'A', formula: '1' }, { name: 'B', formula: '[A] + 1' }], rows: [{ field: 'A' }] }), 0, { name: 'C', formula: '1' })
    expect(s.calcs.map((c) => c.formula)).toEqual(['1', '[C] + 1'])
    expect(s.rows[0]!.field).toBe('C')
  })
})

describe('aliases (1.3.2)', () => {
  const aliases = { BAS: 'Basic', PRM: 'Premium' }
  const view = withEdits({ source: 'subscribers', rows: [{ field: 'Plan Code' }], columns: [{ field: 'Subscribers (Count)' }] }, [{ field: 'Plan Code', aliases }])

  it('relabel members, and members without one keep their name', () => {
    const want = count(ref.subscribers, (s) => s.plan)
    expect(pairs(view)).toEqual({ Basic: want.BAS, Premium: want.PRM, STD: want.STD, ADS: want.ADS })
    const col = rowOrder(view)
    expect(col.raw).toEqual(['ADS', 'BAS', 'PRM', 'STD'])
    expect(col.order).toEqual(['ADS', 'Basic', 'Premium', 'STD'])
  })

  it('leave filters and manual sorts on the underlying members', () => {
    const s = spec({
      ...view,
      rows: [{ field: 'Plan Code', sort: { order: 'asc', manual: ['PRM'] } }],
      filters: [{ kind: 'values', field: 'Plan Code', values: ['PRM', 'BAS'] }],
    })
    expect(rowOrder(s).order).toEqual(['Premium', 'Basic'])
  })
})

describe('data types (1.3.4)', () => {
  it('converts values, and what can’t be read is Null', () => {
    expect(convertValue('07106', 'string', 'number')).toBe(7106)
    expect(convertValue('Berlin', 'string', 'number')).toBeNull()
    expect(convertValue('2025-03-01', 'string', 'date')).toBe(Date.UTC(2025, 2, 1))
    expect(convertValue('March 1', 'string', 'date')).toBeNull()
    expect(convertValue(2019, 'number', 'string')).toBe('2019')
    expect(convertValue(Date.UTC(2025, 2, 1, 14, 30), 'datetime', 'date')).toBe(Date.UTC(2025, 2, 1))
    expect(convertValue(Date.UTC(2025, 2, 1), 'date', 'string')).toBe('2025-03-01')
  })

  it('a postal code read as a number loses its leading zero', () => {
    const s = editField(spec({ source: 'subscribers', rows: [{ field: 'Postal Code' }] }), 'Postal Code', { type: 'number' })
    const members = query(s, data).columns[0]!.order!
    const zeros = ref.subscribers.filter((x) => x.postal.startsWith('0'))
    expect(zeros.length).toBeGreaterThan(0)
    expect(members).toContain(String(Number(zeros[0]!.postal)))
    expect(members).not.toContain(zeros[0]!.postal)
  })

  it('clears date levels, sorts and filters that no longer fit', () => {
    let s = spec({ rows: [{ field: 'Start', date: { level: 'month', mode: 'part' } }], filters: [{ kind: 'datePart', field: 'Start', level: 'year', values: [2025] }] })
    s = editField(s, 'Start', { type: 'string' })
    expect(s.rows).toEqual([{ field: 'Start' }])
    expect(s.filters).toEqual([])
    expect(resolvePill(s, { field: 'Start' }).date).toBeUndefined()
  })

  it('date & time to date keeps the day', () => {
    const s = withEdits({ rows: [{ field: 'Start', date: { level: 'day', mode: 'value' } }], columns: [{ field: 'Sessions (Count)' }] }, [{ field: 'Start', type: 'date' }])
    expect(pairs(s)).toEqual(pairs(spec({ ...s, fields: [] })))
  })
})

describe('geographic roles (1.3.3)', () => {
  it('a role makes a field geographic, and none removes it', () => {
    expect(fieldOf(withEdits({ source: 'subscribers' }, [{ field: 'Country', geo: null }]), 'Country')!.geo).toBeUndefined()
    const s = withEdits({ source: 'subscribers' }, [{ field: 'Regional Manager', geo: 'city' }])
    expect(fieldOf(s, 'Regional Manager')!.geo).toBe('city')
  })

  it('Latitude and Longitude roles are for numbers only', () => {
    expect(fieldOf(withEdits({ source: 'subscribers' }, [{ field: 'Latitude', type: 'string' }]), 'Latitude')!.geo).toBeUndefined()
  })

  it('generated coordinates follow the role', () => {
    const view = { source: 'subscribers', columns: [{ field: 'Longitude (generated)' }], rows: [{ field: 'Latitude (generated)' }], marks: { detail: [{ field: 'Country' }] } }
    expect(query(spec(view), data).rows.length).toBe(new Set(ref.subscribers.map((s) => s.country.country)).size)
    expect(() => query(withEdits(view, [{ field: 'Country', geo: null }]), data)).toThrow(/needs a geographic field/)
  })
})

describe('default properties and conversions (1.3.5, 4.2)', () => {
  it('a measure converted to a dimension has members', () => {
    const s = withEdits({ source: 'subscribers', rows: [{ field: 'Screens' }], columns: [{ field: 'Subscribers (Count)' }] }, [{ field: 'Screens', role: 'dimension' }])
    expect(resolvePill(s, { field: 'Screens' })).toMatchObject({ kind: 'dimension', continuous: false })
    expect(Object.keys(pairs(s)).length).toBeGreaterThan(1)
  })

  it('Convert to Continuous changes the pills a field starts as', () => {
    const s = withEdits({}, [
      { field: 'Start', as: 'continuous' },
      { field: 'Release Year', as: 'continuous' },
    ])
    expect(resolvePill(s, { field: 'Start' })).toMatchObject({ continuous: true, date: { level: 'year', mode: 'value' } })
    expect(resolvePill(s, { field: 'Release Year' })).toMatchObject({ kind: 'dimension', continuous: true })
    expect(resolvePill(s, { field: 'Start', date: { level: 'month', mode: 'part' } }).continuous).toBe(false)
  })

  it('the default aggregation is used when the measure is first added', () => {
    const s = withEdits({}, [{ field: 'Minutes Watched', agg: 'avg' }])
    expect(resolvePill(s, { field: 'Minutes Watched' }).label).toBe('AVG(Minutes Watched)')
    expect(resolvePill(s, { field: 'Minutes Watched', agg: 'max' }).label).toBe('MAX(Minutes Watched)')
  })

  it('the default sort applies unless the pill has its own', () => {
    const sort = { order: 'desc' as const, field: 'Minutes Watched', agg: 'sum' as const }
    const view = { rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] }
    const sorted = withEdits(view, [{ field: 'Genre', sort }])
    const result = query(sorted, data)
    const values = result.rows.map((r) => r[columnOf(result, sorted, { field: 'Minutes Watched' }).id] as number)
    expect(values).toEqual([...values].sort((a, b) => b - a))
    const own = rowOrder(withEdits({ ...view, rows: [{ field: 'Genre', sort: { order: 'asc' } }] }, [{ field: 'Genre', sort }])).order!
    expect(own).toEqual([...own].sort())
  })

  it('a number format shows on axes, tooltips and labels', () => {
    const format = { kind: 'number' as const, decimals: 1, units: 'K' as const, separators: true, prefix: '', suffix: '' }
    expect(formatNumber(20_000, format)).toBe('20.0K')
    expect(formatNumber(0.256, { ...format, kind: 'percent', decimals: 0, units: '' })).toBe('26%')
    expect(formatNumber(1234.5, { ...format, units: '', decimals: 2, prefix: '$' })).toBe('$1,234.50')
    const s = withEdits({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }], marks: { label: { field: 'Minutes Watched' } } }, [{ field: 'Minutes Watched', format }])
    const result = query(s, data)
    const minutes = columnOf(result, s, { field: 'Minutes Watched' })
    const vl = JSON.stringify(toVegaLite(s, result))
    expect(vl).toContain('labelExpr')
    expect(vl).toContain(`"${minutes.id}f"`)
    expect(vl).toContain(formatNumber(result.rows[0]![minutes.id] as number, format))
  })

  it('travel in the #spec= hash', () => {
    const s = editField(placePill(spec({ source: 'subscribers' }), { field: 'Plan Code' }, 'rows'), 'Plan Code', { aliases: { PRM: 'Premium' }, comment: 'From plans.csv' })
    expect(parseSpecHash(specHash(s))).toEqual(s)
  })
})
