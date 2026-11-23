import { describe, expect, it } from 'vitest'
import { matchSpec } from './match'
import { vizSpecSchema } from './spec'

const spec = (s: unknown) => vizSpecSchema.parse(s)
const month = { field: 'Start', date: { level: 'month', mode: 'value' } }
const target = spec({ columns: [month], rows: [{ field: 'Minutes Watched' }], marks: { color: { field: 'Type' } } })

describe('matchSpec', () => {
  it('accepts the same chart written differently', () => {
    // Explicit default aggregation, explicit mark type, extra tooltip pills.
    const mine = spec({
      columns: [{ ...month, as: 'continuous' }],
      rows: [{ field: 'Minutes Watched', agg: 'sum' }],
      marks: { type: 'line', color: { field: 'Type' }, tooltip: [{ field: 'Device' }] },
    })
    expect(matchSpec(mine, [target])).toEqual({ ok: true, hints: [] })
  })

  it('hints at what differs: count, field, aggregation, date level, continuity', () => {
    const hints = (s: unknown) => matchSpec(spec(s), [target]).hints
    expect(hints({ columns: [month], rows: [] })).toContain('Rows should hold 1 pill; it holds 0.')
    expect(hints({ columns: [month], rows: [{ field: 'Runtime' }] })[0]).toMatch(/Rows holds SUM\(Runtime\), but the target uses a different field/)
    expect(hints({ columns: [month], rows: [{ field: 'Minutes Watched', agg: 'avg' }] })[0]).toMatch(/needs a different aggregation/)
    expect(hints({ columns: [{ field: 'Start' }], rows: [{ field: 'Minutes Watched' }] })[0]).toMatch(/different date level/)
    expect(hints({ columns: [{ ...month, as: 'discrete' }], rows: [{ field: 'Minutes Watched' }] })[0]).toMatch(/should be continuous \(green\)/)
    expect(hints({ columns: [month], rows: [{ field: 'Minutes Watched' }], marks: { type: 'bar', color: { field: 'Type' } } })).toEqual(['The mark type isn’t right yet.'])
    expect(hints({ columns: [month], rows: [{ field: 'Minutes Watched' }] })).toEqual(['Something belongs on Color.'])
    expect(hints({ source: 'titles' })[0]).toMatch(/Sessions data source/)
  })

  it('treats Detail as unordered, filters as sets and sorts only where the target has one', () => {
    const t = spec({
      rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched', agg: 'sum' } }],
      columns: [{ field: 'Minutes Watched' }],
      marks: { detail: [{ field: 'Device' }, { field: 'Type' }] },
      filters: [{ kind: 'values', field: 'Device', values: ['TV', 'Web'] }],
    })
    const mine = {
      rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched' } }],
      columns: [{ field: 'Minutes Watched' }],
      marks: { detail: [{ field: 'Type' }, { field: 'Device' }] },
      filters: [{ kind: 'values', field: 'Device', values: ['Web', 'TV'] }],
    }
    expect(matchSpec(spec(mine), [t]).ok).toBe(true)
    expect(matchSpec(spec({ ...mine, rows: [{ field: 'Genre' }] }), [t]).hints).toEqual(['Sort Genre the way the target does.'])
    expect(matchSpec(spec({ ...mine, filters: [] }), [t]).hints[0]).toMatch(/Filters shelf/)
    // A target without a sort accepts any sort.
    expect(matchSpec(spec({ rows: [{ field: 'Genre', sort: { order: 'desc' } }] }), [spec({ rows: [{ field: 'Genre' }] })]).ok).toBe(true)
  })

  it('takes hints from the closest accepted spec and reports broken pills', () => {
    const other = spec({ rows: [{ field: 'Region' }] })
    expect(matchSpec(spec({ columns: [month] }), [other, target]).hints).toEqual(['Rows should hold 1 pill; it holds 0.', 'Something belongs on Color.'])
    expect(matchSpec(spec({ rows: [{ field: 'Nope' }] }), [target]).hints[0]).toMatch(/broken/)
  })
})
