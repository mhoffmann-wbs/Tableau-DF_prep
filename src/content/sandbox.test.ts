// Content tests for the sandbox challenges: each target draws over the real
// data, each accepted spec matches itself, and no challenge starts solved.
import { compile } from 'vega-lite'
import { describe, expect, it } from 'vitest'
import { emptySpec } from '../engine/edit'
import { matchSpec } from '../engine/match'
import { query } from '../engine/query'
import { toVegaLite } from '../engine/render'
import { testDataset } from '../test/dataset'
import { OBJECTIVE_BY_ID } from './blueprint'
import { SANDBOX_CHALLENGES } from './sandbox'

const data = testDataset()
// Maps need the world shapes only to draw, not to compile.
const world = { type: 'Topology', objects: { countries: {} } } as const

describe('sandbox challenges', () => {
  it('have unique ids and known objectives', () => {
    const ids = SANDBOX_CHALLENGES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of SANDBOX_CHALLENGES) for (const o of c.objectives) expect(OBJECTIVE_BY_ID.has(o), `${c.id}: ${o}`).toBe(true)
  })

  it.each(SANDBOX_CHALLENGES.map((c) => [c.id, c] as const))('%s draws every accepted spec and starts unsolved', (_, c) => {
    for (const spec of c.accept) {
      const result = query(spec, data)
      expect(result.rows.length).toBeGreaterThan(1)
      expect(() => compile(toVegaLite(spec, result, { world }))).not.toThrow()
      expect(matchSpec(spec, c.accept).ok).toBe(true)
    }
    const start = c.start ?? emptySpec(c.accept[0]!.source)
    expect(start.source).toBe(c.accept[0]!.source)
    expect(matchSpec(start, c.accept).ok).toBe(false)
  })
})
