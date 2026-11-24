// Content tests for the simulators: each has a component, the copy that
// component reads, known objectives, and closing items from the bank on those
// objectives.
import { describe, expect, it } from 'vitest'
import { SIM_COMPONENTS } from '../sims'
import { ITEMS } from './bank'
import { OBJECTIVE_BY_ID } from './blueprint'
import { SIM_ORDER, SIMS } from './sims'

describe('simulators', () => {
  it('match the registered components and SIM_ORDER one to one', () => {
    expect(SIMS.map((s) => s.id).sort()).toEqual(Object.keys(SIM_COMPONENTS).sort())
    expect([...SIM_ORDER].sort()).toEqual(Object.keys(SIM_COMPONENTS).sort())
  })

  it.each(SIMS.map((s) => [s.id, s] as const))('%s: copy, objectives and items fit', async (_, sim) => {
    for (const o of sim.objectives) expect(OBJECTIVE_BY_ID.has(o), o).toBe(true)
    const keys = (await SIM_COMPONENTS[sim.id]!.load()).COPY_KEYS
    expect(Object.keys(sim.copy).sort()).toEqual([...keys].sort())
    expect(new Set(sim.items).size).toBe(sim.items.length)
    for (const id of sim.items) {
      const item = ITEMS.find((i) => i.id === id)
      expect(item, id).toBeDefined()
      expect(
        item!.objectives.some((o) => sim.objectives.includes(o)),
        `${id} tests one of the simulator's objectives`,
      ).toBe(true)
    }
  })
})
