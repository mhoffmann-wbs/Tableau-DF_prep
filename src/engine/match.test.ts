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
    const other = spec({ rows: [{ field: 'Region' }], marks: { size: { field: 'Runtime' } } })
    expect(matchSpec(spec({ columns: [month] }), [other, target]).hints).toEqual(['Rows should hold 1 pill; it holds 0.', 'Something belongs on Color.'])
    expect(matchSpec(spec({ rows: [{ field: 'Nope' }] }), [target]).hints[0]).toMatch(/broken/)
  })

  it('compares each measure’s mark, dual and synchronized axes and the Measure Values card', () => {
    const dual = spec({
      columns: [month],
      rows: [{ field: 'Minutes Watched', mark: 'bar' }, { field: 'Sessions (Count)', mark: 'line' }],
      axes: { rows: { dual: true } },
    })
    // The line measure's mark can come from Automatic (a date and a measure).
    expect(matchSpec(spec({ ...dual, rows: [{ field: 'Minutes Watched', mark: 'bar' }, { field: 'Sessions (Count)' }] }), [dual]).ok).toBe(true)
    expect(matchSpec(spec({ ...dual, rows: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }] }), [dual]).hints).toEqual([
      'The mark type for SUM(Minutes Watched) isn’t right yet.',
    ])
    expect(matchSpec(spec({ ...dual, axes: {} }), [dual]).hints).toEqual(['The two measures on Rows share one pane in the target: use Dual Axis.'])
    expect(matchSpec(spec({ ...dual, axes: { rows: { dual: true, sync: true } } }), [dual]).hints[0]).toMatch(/isn’t synchronized/)

    const combined = spec({
      columns: [month],
      rows: [{ field: 'Measure Values' }],
      marks: { color: { field: 'Measure Names' } },
      measureValues: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }],
    })
    expect(matchSpec(spec({ ...combined, measureValues: [{ field: 'Sessions (Count)' }, { field: 'Minutes Watched' }] }), [combined]).hints).toEqual([
      'The Measure Values card should hold 2 pills: check which measures are there, and their order.',
    ])
  })

  it('compares reference items without their labels, and totals', () => {
    const bars = { rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] }
    const ref = { kind: 'line', measure: { field: 'Minutes Watched' }, scope: 'table', value: { kind: 'computed', agg: 'avg' } }
    const t = spec({ ...bars, refs: [ref], totals: { column: true } })
    expect(matchSpec(spec({ ...bars, refs: [{ ...ref, label: 'value' }], totals: { column: true, using: 'automatic' } }), [t]).ok).toBe(true)
    expect(matchSpec(spec({ ...bars, refs: [{ ...ref, scope: 'pane' }], totals: { column: true } }), [t]).hints[0]).toMatch(/reference lines/)
    expect(matchSpec(spec({ ...bars, refs: [ref] }), [t]).hints).toEqual(['The totals aren’t right yet: check Analysis > Totals.'])
  })

  it('compares the calcs, groups, sets and bins the target defines', () => {
    const t = spec({
      calcs: [{ name: 'Hours', formula: '[Minutes Watched] / 60' }],
      bins: [{ name: 'Minutes (bin)', field: 'Minutes Watched', size: 10 }],
      groups: [{ name: 'G', field: 'Genre', groups: [{ name: 'A', members: ['Comedy', 'Drama'] }] }],
      rows: [{ field: 'Minutes (bin)' }],
      columns: [{ field: 'Hours' }],
    })
    const same = { ...t, calcs: [{ name: 'Hours', formula: '[Minutes Watched]/60' }], groups: [{ ...t.groups[0]!, groups: [{ name: 'A', members: ['Drama', 'Comedy'] }] }] }
    expect(matchSpec(spec(same), [t]).ok).toBe(true)
    expect(matchSpec(spec({ ...same, bins: [{ name: 'Minutes (bin)', field: 'Minutes Watched', size: 5 }] }), [t]).hints).toEqual(['Minutes (bin) isn’t defined the way the target’s bin field is yet.'])
    expect(matchSpec(spec({ ...same, groups: [] }), [t]).hints).toEqual(['The target uses a group named G: create it (or rename yours to that name).'])
  })
})
