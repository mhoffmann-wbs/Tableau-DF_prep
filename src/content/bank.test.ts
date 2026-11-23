// Content tests over the real question bank: files, ids, the anti-giveaway
// checks, and every viz item drawn and its stated numbers recomputed.
import { compile } from 'vega-lite'
import { describe, expect, it } from 'vitest'
import { query } from '../engine/query'
import { toVegaLite } from '../engine/render'
import { testDataset } from '../test/dataset'
import { OBJECTIVE_BY_ID, TASK_BY_ID } from './blueprint'
import { ITEMS, QUESTION_FILES } from './bank'
import { evaluateFact } from './facts'
import { QUALITY_CHECKS } from './quality'
import { itemFileSchema } from './schema'

describe('question bank', () => {
  it.each(Object.entries(QUESTION_FILES))('%s.json parses and belongs to its task', (fileId, data) => {
    expect(TASK_BY_ID.has(fileId), `no task ${fileId}`).toBe(true)
    const parsed = itemFileSchema.safeParse(data)
    expect(parsed.success, parsed.error?.message).toBe(true)
    for (const item of parsed.data ?? []) {
      expect(item.taskId).toBe(fileId)
      for (const o of item.objectives) expect(OBJECTIVE_BY_ID.has(o), `${item.id}: unknown objective ${o}`).toBe(true)
    }
  })

  it('has unique item ids', () => {
    const ids = ITEMS.map((i) => i.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it.each(Object.entries(QUALITY_CHECKS))('passes the %s check', (_, check) => {
    expect(check(ITEMS)).toEqual([])
  })
})

const data = testDataset()
// Maps need the world shapes only to draw, not to compile.
const world = { type: 'Topology', objects: { countries: {} } } as const
const VIZ_ITEMS = ITEMS.flatMap((i) => (i.kind === 'viz' ? [[i.id, i] as const] : []))

describe.skipIf(VIZ_ITEMS.length === 0)('viz items', () => {
  it.each(VIZ_ITEMS)('%s draws over the data and states its checks as the data computes them', (_, item) => {
    const result = query(item.viz.spec, data)
    expect(result.rows.length).toBeGreaterThan(0)
    expect(() => compile(toVegaLite(item.viz.spec, result, { world }))).not.toThrow()
    const texts = [item.stem, ...item.options.map((o) => o.text)].join('\n')
    for (const fact of item.checks ?? []) {
      expect(fact.says).toBe(evaluateFact(fact, data))
      expect(texts, `${item.id} never states "${fact.says}"`).toContain(fact.says)
    }
  })
})
