import { describe, expect, it } from 'vitest'
import { combineOnAxis, continuousOn, defaultFilter, emptySpec, setDualAxis, setPillMark, setSyncAxis, isCompleteFilter, movePill, parseSpecHash, pillFor, placePill, removeCalc, removePill, reorderPill, setCalc, specHash, usesField } from './edit'
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

  it('reorders a pill one place at a time, the keyboard alternative to dragging', () => {
    const s = vizSpecSchema.parse({ columns: [genre, device, minutes], marks: { color: genre } })
    const order = (x: typeof s) => x.columns.map((p) => p.field)
    expect(order(reorderPill(s, { shelf: 'columns', index: 0 }, 1))).toEqual(['Device', 'Genre', 'Minutes Watched'])
    expect(order(reorderPill(s, { shelf: 'columns', index: 2 }, -1))).toEqual(['Genre', 'Minutes Watched', 'Device'])
    expect(reorderPill(s, { shelf: 'columns', index: 2 }, 1)).toBe(s)
    expect(reorderPill(s, { shelf: 'columns', index: 0 }, -1)).toBe(s)
    expect(reorderPill(s, { shelf: 'color', index: 0 }, 1)).toBe(s)
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

describe('axes', () => {
  const month = { field: 'Start', date: { level: 'month' as const, mode: 'value' as const } }

  it('a measure dropped on an axis makes a combined axis of Measure Values', () => {
    let s = vizSpecSchema.parse({ columns: [month], rows: [{ field: 'Minutes Watched', agg: 'avg' }] })
    s = combineOnAxis(s, 'rows', 'Runtime')
    expect(s.rows).toEqual([{ field: 'Measure Values' }])
    expect(s.measureValues).toEqual([{ field: 'Minutes Watched', agg: 'avg' }, { field: 'Runtime' }])
    expect(s.marks.color).toEqual({ field: 'Measure Names' })
    s = combineOnAxis(s, 'rows', 'Sessions (Count)')
    expect(s.measureValues.map((p) => p.field)).toEqual(['Minutes Watched', 'Runtime', 'Sessions (Count)'])
    expect(() => combineOnAxis(s, 'rows', 'Genre')).toThrow(/Only measures/)
    expect(() => combineOnAxis(vizSpecSchema.parse({ rows: [genre] }), 'rows', 'Runtime')).toThrow(/no axis/)
  })

  it('Dual Axis, Synchronize Axis and a mark per measure', () => {
    let s = vizSpecSchema.parse({ columns: [month], rows: [minutes, pillFor('Sessions (Count)')] })
    expect(continuousOn(s, 'rows')).toHaveLength(2)
    s = setSyncAxis(setDualAxis(s, 'rows', true), 'rows', true)
    expect(s.axes.rows).toEqual({ dual: true, sync: true })
    s = setPillMark(s, { shelf: 'rows', index: 0 }, 'bar')
    expect(s.rows[0]).toEqual({ ...minutes, mark: 'bar' })
    expect(parseSpecHash(specHash(s))).toEqual(s)
    s = setDualAxis(setPillMark(s, { shelf: 'rows', index: 0 }, 'automatic'), 'rows', false)
    expect([s.rows[0], s.axes.rows]).toEqual([minutes, undefined])
  })
})
