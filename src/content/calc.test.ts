// Content tests for the calc exercises: each reference formula compiles over
// its source and gives more than one value, the listed fields are the ones it
// uses, every accepted formula passes the check and every wrong one fails.
import { describe, expect, it } from 'vitest'
import { checkCalc, fieldsUsed, previewCalc } from '../engine/calc/run'
import { fieldOf } from '../engine/model'
import { testDataset } from '../test/dataset'
import { OBJECTIVE_BY_ID } from './blueprint'
import { CALC_EXERCISES, CALC_FILES } from './calc'

const data = testDataset()

describe('calc exercises', () => {
  it('have unique ids, known objectives and live in the file of their first objective’s task', () => {
    const ids = CALC_EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const [task, list] of Object.entries(CALC_FILES))
      for (const e of list as { id: string; objectives: string[] }[]) {
        expect(e.objectives[0]!.startsWith(`${task}.`), e.id).toBe(true)
        for (const o of e.objectives) expect(OBJECTIVE_BY_ID.has(o), `${e.id}: ${o}`).toBe(true)
      }
  })

  it.each(CALC_EXERCISES.map((e) => [e.id, e] as const))('%s: the reference works and the check tells right from wrong', (_, e) => {
    const sheet = { source: e.source, calcs: [{ name: e.name, formula: e.expected }] }
    const field = fieldOf(sheet, e.name)
    expect(field?.calc?.error?.message, e.expected).toBeUndefined()
    expect([...fieldsUsed(e.expected)].sort()).toEqual([...e.fields].sort())
    for (const f of [...e.fields, ...e.by]) expect(fieldOf(e.source, f), f).toBeDefined()
    const aggregate = field!.calc!.compiled!.aggregate
    expect(e.by.length > 0, 'aggregate exercises, and only they, compare by dimensions').toBe(aggregate)

    // More than one distinct value, so a constant can't pass.
    const preview = previewCalc(data, sheet, e.by, Infinity)
    expect(new Set(preview.rows.map((r) => r.at(-1))).size).toBeGreaterThan(1)

    expect(checkCalc(data, { source: e.source }, e.expected, e.expected, e.by)).toEqual({ ok: true })
    for (const f of e.accepted) expect(checkCalc(data, { source: e.source }, f, e.expected, e.by), f).toEqual({ ok: true })
    for (const f of e.wrong) expect(checkCalc(data, { source: e.source }, f, e.expected, e.by).ok, f).toBe(false)
  })
})
