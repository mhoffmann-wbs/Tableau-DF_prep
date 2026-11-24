import { describe, expect, it } from 'vitest'
import { referenceData, testDataset } from '../test/dataset'
import { addToHierarchy, createHierarchy, drillDown, drillState, drillUp, editField, parseSpecHash, removeDerived, setDerived, specHash } from './edit'
import { binOf, fieldOf } from './model'
import { resolvePill } from './pills'
import { columnOf, query } from './query'
import { type VizSpec, vizSpecSchema } from './spec'

const data = testDataset()
const ref = referenceData()
const spec = (s: unknown): VizSpec => vizSpecSchema.parse(s)
/** {member of the first row pill: value of the first column pill}. */
const pairs = (s: VizSpec) => {
  const result = query(s, data)
  const d = columnOf(result, s, s.rows[0]!)
  const m = columnOf(result, s, s.columns[0]!)
  return Object.fromEntries(result.rows.map((r) => [String(r[d.id]), r[m.id]]))
}
const tally = <T>(xs: T[], key: (x: T) => string, value: (x: T) => number = () => 1) => {
  const m: Record<string, number> = {}
  for (const x of xs) m[key(x)] = (m[key(x)] ?? 0) + value(x)
  return m
}
const subscribersBy = (field: string, extra: object = {}) =>
  spec({ source: 'subscribers', rows: [{ field }], columns: [{ field: 'Subscribers (Count)' }], ...extra })

describe('groups (2.2.1)', () => {
  const cities = tally(ref.subscribers, (s) => s.cityLabel)
  const group = { name: 'City (group)', field: 'City', groups: [{ name: 'Cologne', members: ['Cologne', 'Köln'] }] }

  it('combine members; the others keep their names', () => {
    expect(cities.Cologne! * cities['Köln']!).toBeGreaterThan(0)
    const got = pairs(subscribersBy('City (group)', { groups: [group] }))
    expect(got.Cologne).toBe(cities.Cologne! + cities['Köln']!)
    expect(got['Köln']).toBeUndefined()
    expect(Object.keys(got).length).toBe(Object.keys(cities).length - 1)
  })

  it('Include Other lumps every member outside a group together', () => {
    const got = pairs(subscribersBy('City (group)', { groups: [{ ...group, other: true }] }))
    expect(got).toEqual({ Cologne: cities.Cologne! + cities['Köln']!, Other: ref.subscribers.length - cities.Cologne! - cities['Köln']! })
  })

  it('are dimensions that follow a rename of their field and can’t go into formulas', () => {
    let s = subscribersBy('City (group)', { groups: [group] })
    expect(resolvePill(s, { field: 'City (group)' })).toMatchObject({ kind: 'dimension', continuous: false })
    s = editField(s, 'City', { name: 'Town' })
    expect(s.groups[0]!.field).toBe('Town')
    expect(pairs(s).Cologne).toBe(cities.Cologne! + cities['Köln']!)
    const calc = fieldOf({ ...s, calcs: [{ name: 'X', formula: 'LEN([City (group)])' }] }, 'X')!
    expect(calc.calc!.error!.message).toMatch(/can’t use groups, sets or bins/)
  })

  it('refuse a taken name, and leave the sheet with their pills when removed', () => {
    expect(() => setDerived(spec({ source: 'subscribers' }), 'groups', undefined, { ...group, name: 'Country' })).toThrow(/already a field/)
    const s = removeDerived(subscribersBy('City (group)', { groups: [group], filters: [{ kind: 'values', field: 'City (group)', values: ['Cologne'] }] }), 'City (group)')
    expect([s.groups, s.rows, s.filters]).toEqual([[], [], []])
  })
})

describe('sets (2.2.2)', () => {
  const minutesByGenre = tally(
    ref.sessions,
    (s) => s.title.genre,
    (s) => s.minutes ?? 0,
  )
  const genres = Object.keys(minutesByGenre)
  const view = (set: object, setView?: 'members') =>
    spec({ sets: [{ name: 'Genre Set', field: 'Genre', ...set }], rows: [{ field: 'Genre Set', ...(setView && { setView }) }], columns: [{ field: 'Minutes Watched' }] })
  const total = Object.values(minutesByGenre).reduce((a, b) => a + b, 0)

  it('split members into In and Out (General tab)', () => {
    const inSet = genres.slice(0, 2)
    const got = pairs(view({ rule: { kind: 'members', members: inSet } }))
    const want = inSet.reduce((a, g) => a + minutesByGenre[g]!, 0)
    expect(got).toEqual({ In: want, Out: total - want })
    expect(pairs(view({ rule: { kind: 'members', members: inSet, exclude: true } }))).toEqual({ In: total - want, Out: want })
  })

  it('a condition is computed per member over the whole source', () => {
    const cut = Object.values(minutesByGenre).sort((a, b) => a - b)[Math.floor(genres.length / 2)]!
    const got = pairs(view({ rule: { kind: 'condition', field: 'Minutes Watched', agg: 'sum', op: '>=', value: cut } }, 'members'))
    expect(got).toEqual(Object.fromEntries(genres.filter((g) => minutesByGenre[g]! >= cut).map((g) => [g, minutesByGenre[g]])))
  })

  it('Top N keeps the top (or bottom) members, and filters don’t change membership', () => {
    const ranked = [...genres].sort((a, b) => minutesByGenre[b]! - minutesByGenre[a]!)
    const top = view({ rule: { kind: 'top', from: 'top', n: 3, field: 'Minutes Watched', agg: 'sum' } }, 'members')
    expect(Object.keys(pairs(top)).sort()).toEqual(ranked.slice(0, 3).sort())
    const bottom = view({ rule: { kind: 'top', from: 'bottom', n: 2, field: 'Minutes Watched', agg: 'sum' } }, 'members')
    expect(Object.keys(pairs(bottom)).sort()).toEqual(ranked.slice(-2).sort())
    const filtered = spec({ ...top, filters: [{ kind: 'values', field: 'Genre', values: [ranked[0]!], exclude: true }] })
    expect(Object.keys(pairs(filtered)).sort()).toEqual(ranked.slice(1, 3).sort())
  })

  it('filter a view to the members In the set', () => {
    const s = spec({ ...view({ rule: { kind: 'members', members: [genres[0]!] } }), rows: [{ field: 'Genre' }], filters: [{ kind: 'values', field: 'Genre Set', values: ['In'] }] })
    expect(pairs(s)).toEqual({ [genres[0]!]: minutesByGenre[genres[0]!] })
  })

  it('only sets show members', () => {
    expect(() => resolvePill(spec({}), { field: 'Genre', setView: 'members' })).toThrow(/not a set/)
  })
})

describe('bins (2.3.4)', () => {
  it('cut a measure into ranges, lower limit inclusive', () => {
    expect([binOf(0, 10), binOf(9.99, 10), binOf(10, 10), binOf(-1, 10), binOf(0.3, 0.1)]).toEqual([0, 0, 10, -10, 0.3])
  })

  it('make a histogram: count of sessions per bin', () => {
    const s = spec({ bins: [{ name: 'Minutes Watched (bin)', field: 'Minutes Watched', size: 15 }], rows: [{ field: 'Minutes Watched (bin)' }], columns: [{ field: 'Sessions (Count)' }] })
    expect(resolvePill(s, s.rows[0]!)).toMatchObject({ kind: 'dimension', continuous: false })
    const want = tally(ref.sessions, (x) => (x.minutes === null ? 'Null' : String(Math.floor(x.minutes / 15) * 15)))
    expect(pairs(s)).toEqual(want)
    const order = columnOf(query(s, data), s, s.rows[0]!).order!
    expect(order.filter((m) => m !== 'Null').map(Number)).toEqual([...order.filter((m) => m !== 'Null').map(Number)].sort((a, b) => a - b))
  })

  it('need a number field', () => {
    const s = spec({ bins: [{ name: 'Genre (bin)', field: 'Genre', size: 5 }] })
    expect(fieldOf(s, 'Genre (bin)')!.broken).toMatch(/need a number field/)
    expect(() => resolvePill(s, { field: 'Genre (bin)' })).toThrow(/need a number field/)
  })
})

describe('hierarchies (2.2.3)', () => {
  const base = createHierarchy(spec({ source: 'titles' }), 'Content', ['Type', 'Genre', 'Sub-Genre'])

  it('drill down one level at a time on the same shelf, and up again', () => {
    let s = spec({ ...base, rows: [{ field: 'Type' }], columns: [{ field: 'Titles (Count)' }] })
    expect(drillState(s, { shelf: 'rows', index: 0 })).toEqual({ down: 'Genre', up: false })
    s = drillDown(s, { shelf: 'rows', index: 0 })
    s = drillDown(s, { shelf: 'rows', index: 1 })
    expect(s.rows.map((p) => p.field)).toEqual(['Type', 'Genre', 'Sub-Genre'])
    expect(drillState(s, { shelf: 'rows', index: 2 })).toEqual({ down: undefined, up: false })
    expect(drillState(s, { shelf: 'rows', index: 0 })).toEqual({ down: undefined, up: true })
    expect(query(s, data).rows.length).toBe(new Set(ref.titles.map((t) => `${t.type}|${t.genre}|${t.subGenre}`)).size)
    expect(drillUp(s, { shelf: 'rows', index: 0 }).rows).toEqual([{ field: 'Type' }])
  })

  it('a field sits in one hierarchy at a time', () => {
    const s = addToHierarchy(createHierarchy(base, 'Ratings', ['Rating']), 'Ratings', 'Genre')
    expect(s.hierarchies).toEqual([
      { name: 'Content', fields: ['Type', 'Sub-Genre'] },
      { name: 'Ratings', fields: ['Rating', 'Genre'] },
    ])
    expect(() => createHierarchy(s, 'Genre', ['Title'])).toThrow(/already a field or hierarchy/)
  })

  it('everything travels in the #spec= hash', () => {
    const s = spec({ ...base, bins: [{ name: 'Runtime (bin)', field: 'Runtime', size: 10 }], sets: [{ name: 'S', field: 'Genre', rule: { kind: 'members', members: [] } }] })
    expect(parseSpecHash(specHash(s))).toEqual(s)
  })
})
