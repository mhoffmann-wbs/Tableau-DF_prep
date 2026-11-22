import { describe, expect, it } from 'vitest'
import { MULTI, SINGLE, VIZ } from '../test/fixtures'
import { type Item, itemSchema } from './schema'
import { QUALITY_CHECKS } from './quality'

const problems = (item: unknown) => {
  const r = itemSchema.safeParse(item)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('item schema', () => {
  it.each([SINGLE, MULTI, VIZ])('accepts the $kind fixture', (item) => {
    expect(problems(item)).toEqual([])
  })

  it('fills viz spec defaults', () => {
    const parsed = itemSchema.parse({ ...VIZ, viz: { spec: { rows: [{ field: 'Genre' }] } } })
    expect(parsed.kind === 'viz' && parsed.viz).toEqual({
      show: 'chart',
      spec: { source: 'sessions', columns: [], rows: [{ field: 'Genre' }], marks: { type: 'automatic', detail: [], tooltip: [] }, filters: [] },
    })
  })

  it('checks ids and objectives against the task', () => {
    expect(problems({ ...SINGLE, id: '4.2-001' })).toContain('id must start with taskId')
    expect(problems({ ...SINGLE, objectives: ['4.2.1'] })).toContain('objective 4.2.1 is not under task 4.1')
  })

  it('checks the key count and the "Choose N answers" phrase', () => {
    expect(problems({ ...MULTI, select: 3 })).toEqual(expect.arrayContaining(['2 correct options, expected 3', 'stem must say "(Choose 3 answers.)"']))
    expect(problems({ ...SINGLE, stem: `${SINGLE.stem} (Choose 2 answers.)` })).toContain('single-choice stem must not say how many to choose')
    expect(problems({ ...VIZ, select: 2, stem: `${VIZ.stem} (Choose 2 answers.)` })).toContain('multi-select needs at least 5 options')
  })

  it('rejects duplicate options and a weekday date value', () => {
    const dup = { ...SINGLE, options: [...SINGLE.options.slice(0, 3), SINGLE.options[1]] }
    expect(problems(dup)).toContain('duplicate option texts')
    const weekday = { ...VIZ, viz: { spec: { columns: [{ field: 'Start', date: { level: 'weekday', mode: 'value' } }] } } }
    expect(problems(weekday)).toContain('weekday is a date part only')
  })
})

describe('quality checks', () => {
  const singles = (keyIndex: (i: number) => number, n = 12): Item[] =>
    Array.from({ length: n }, (_, i) => ({
      ...SINGLE,
      id: `4.1-${String(i + 1).padStart(3, '0')}`,
      stem: `Question ${i}?`,
      options: SINGLE.options.map((o, j) => ({ ...o, correct: j === keyIndex(i) })),
    }))

  it('flags a key letter used in more than 40% of items', () => {
    expect(QUALITY_CHECKS.keyLetterBalance(singles(() => 0))).toHaveLength(1)
    expect(QUALITY_CHECKS.keyLetterBalance(singles((i) => i % 4))).toEqual([])
  })

  it('flags duplicate stems and letter references', () => {
    expect(QUALITY_CHECKS.duplicateStems([SINGLE, { ...SINGLE, id: '4.1-009' }])).toHaveLength(1)
    expect(QUALITY_CHECKS.letterReferences([{ ...SINGLE, explanation: 'Option B is wrong.' }])).toHaveLength(1)
  })
})
