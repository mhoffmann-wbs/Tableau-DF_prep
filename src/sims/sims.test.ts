// Every state a simulator can reach draws over the Driftlight data.
import { compile } from 'vega-lite'
import { describe, expect, it } from 'vitest'
import { query } from '../engine/query'
import { resolvePill } from '../engine/pills'
import { toVegaLite } from '../engine/render'
import { testDataset } from '../test/dataset'
import { blueGreenView, FIELDS, LEVELS } from './BlueGreen'
import { AGGS, granularitySpec, granularityStats, STEPS } from './Granularity'

const data = testDataset()

describe('Blue vs. green', () => {
  const states = FIELDS.flatMap((field) =>
    (['columns', 'color'] as const).flatMap((shelf) =>
      [false, true].flatMap((continuous) => (field === 'Start' ? LEVELS : (['year'] as const)).map((level) => ({ field, shelf, continuous, level }))),
    ),
  )
  it.each(states.map((s) => [JSON.stringify(s), s] as const))('%s draws', (_, state) => {
    const { spec, pill, toggles } = blueGreenView(state)
    expect(resolvePill('sessions', pill).continuous).toBe(toggles && state.continuous)
    const result = query(spec, data)
    expect(result.rows.length).toBeGreaterThan(0)
    expect(() => compile(toVegaLite(spec, result))).not.toThrow()
  })
})

describe('Granularity slider', () => {
  const states = AGGS.flatMap((agg) => STEPS.map((_, i) => [i + 1, agg] as const))
  it.each(states)('step %i with %s draws, with marks bounded by the member combinations', (step, agg) => {
    const spec = granularitySpec(step, agg)
    const result = query(spec, data)
    expect(() => compile(toVegaLite(spec, result))).not.toThrow()
    const stats = granularityStats(result, query(granularitySpec(0, agg), data))
    expect(stats.members.map(([f]) => f).sort()).toEqual(STEPS.slice(0, step).map((s) => s.field).sort())
    expect(stats.marks).toBeGreaterThan(1)
    expect(stats.marks).toBeLessThanOrEqual(stats.members.reduce((p, [, n]) => p * n, 1))
    // SUM adds back up to the one-group total; the others don't here.
    expect(Math.abs(stats.sumOfMarks - stats.overall) < 1e-6).toBe(agg === 'sum')
  })

  it('has one mark with no dimension', () => {
    const r = query(granularitySpec(0, 'sum'), data)
    expect(granularityStats(r, r)).toMatchObject({ marks: 1, members: [] })
  })
})
