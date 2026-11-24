import { describe, expect, it } from 'vitest'
import { defaultFilter, emptySpec, isCompleteFilter, movePill, parseSpecHash, pillFor, placePill, removeCalc, removePill, setCalc, specHash, usesField } from './edit'
import { vizSpecSchema } from './spec'

const genre = pillFor('Genre')
const device = pillFor('Device')
const minutes = pillFor('Minutes Watched')

describe('spec edits', () => {
  it('drops pills at the end or at a position, and channels hold one pill', () => {
    let s = placePill(emptySpec(), genre, 'rows')
    s = placePill(s, device, 'rows', 0)
    expect(s.rows.map((p) => p.field)).toEqual(['Device', 'Genre'])
    s = placePill(placePill(s, genre, 'color'), device, 'color')
    expect(s.marks.color).toEqual(device)
  })

  it('moves pills between shelves and within one, and removes them', () => {
    let s = vizSpecSchema.parse({ columns: [genre, device, minutes] })
    s = movePill(s, { shelf: 'columns', index: 0 }, 'columns', 3)
    expect(s.columns.map((p) => p.field)).toEqual(['Device', 'Minutes Watched', 'Genre'])
    s = movePill(s, { shelf: 'columns', index: 1 }, 'rows')
    expect(s.rows).toEqual([minutes])
    s = movePill(s, { shelf: 'columns', index: 0 }, 'detail')
    expect(s.marks.detail).toEqual([device])
    s = removePill(s, { shelf: 'detail', index: 0 })
    expect(s.marks.detail).toEqual([])
    s = movePill(placePill(s, device, 'size'), { shelf: 'size', index: 0 }, 'label')
    expect([s.marks.size, s.marks.label]).toEqual([undefined, device])
  })

  it('starts filters the way the field type suggests', () => {
    expect(defaultFilter('sessions', 'Device')).toEqual({ kind: 'values', field: 'Device', values: [] })
    expect(defaultFilter('sessions', 'Minutes Watched')).toEqual({ kind: 'range', field: 'Minutes Watched', agg: 'sum' })
    expect(defaultFilter('sessions', 'Start')).toMatchObject({ kind: 'datePart', level: 'year' })
    expect(defaultFilter('sessions', 'Latitude (generated)')).toBeUndefined()
    expect(isCompleteFilter({ kind: 'values', field: 'Device', values: [] })).toBe(false)
    expect(isCompleteFilter({ kind: 'range', field: 'Runtime', max: 90 })).toBe(true)
  })
})

describe('#spec= links', () => {
  it('round-trip a spec and leave defaults out', () => {
    const spec = vizSpecSchema.parse({ rows: [genre], columns: [minutes], marks: { color: device } })
    const hash = specHash(spec)
    expect(decodeURIComponent(hash)).toBe('#spec={"columns":[{"field":"Minutes Watched"}],"rows":[{"field":"Genre"}],"marks":{"color":{"field":"Device"}}}')
    expect(parseSpecHash(hash)).toEqual(spec)
    expect(specHash(emptySpec())).toBe(`#spec=${encodeURIComponent('{}')}`)
  })

  it('report a missing or damaged spec', () => {
    expect(parseSpecHash('')).toBeUndefined()
    expect(parseSpecHash('#spec=%7Bnope')).toBeInstanceOf(Error)
    expect(parseSpecHash(`#spec=${encodeURIComponent('{"source":"nope"}')}`)).toBeInstanceOf(Error)
  })
})

describe('calculated fields', () => {
  const hours = { name: 'Hours', formula: '[Minutes Watched] / 60' }
  const sheet = () =>
    vizSpecSchema.parse({
      calcs: [hours, { name: 'Double', formula: '[Hours] * 2' }],
      rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Hours', agg: 'sum' } }],
      columns: [{ field: 'Hours' }],
      filters: [{ kind: 'range', field: 'Hours', min: 1 }],
    })

  it('renames a calc everywhere it is used', () => {
    const s = setCalc(sheet(), 0, { name: 'Hours Watched', formula: hours.formula })
    expect(s.calcs.map((c) => c.formula)).toEqual([hours.formula, '[Hours Watched] * 2'])
    expect(s.columns[0]!.field).toBe('Hours Watched')
    expect(s.rows[0]!.sort!.field).toBe('Hours Watched')
    expect(s.filters[0]!.field).toBe('Hours Watched')
  })

  it('removes a calc with its pills, filters and sorts', () => {
    expect(usesField(sheet(), 'Hours')).toBe(true)
    const s = removeCalc(sheet(), 'Hours')
    expect(s.calcs.map((c) => c.name)).toEqual(['Double'])
    expect(s.columns).toEqual([])
    expect(s.rows).toEqual([{ field: 'Genre' }])
    expect(s.filters).toEqual([])
    expect(usesField(s, 'Hours')).toBe(false)
  })

  it('keeps calcs in the #spec= hash', () => {
    const s = setCalc(emptySpec(), undefined, hours)
    expect(parseSpecHash(specHash(s))).toEqual(s)
    expect(specHash(emptySpec())).not.toContain('calcs')
  })
})
