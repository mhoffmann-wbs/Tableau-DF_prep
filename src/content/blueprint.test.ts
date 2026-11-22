import { describe, expect, it } from 'vitest'
import {
  BANK_TARGET,
  DOMAINS,
  EXAM_FORMAT,
  LESSON_ORDER,
  MIN_PER_OBJECTIVE,
  OBJECTIVES,
  OBJECTIVE_BY_ID,
  TARGETS,
  TASKS,
  allocateMock,
  largestRemainder,
  taskOfObjective,
} from './blueprint'

const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0)

describe('blueprint', () => {
  it('matches the guide: 4 domains, 12 tasks, 56 objectives, weights summing to 100', () => {
    expect(DOMAINS.map((d) => d.weight)).toEqual([23, 37, 25, 15])
    expect(TASKS.map((t) => t.id)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3'])
    expect(TASKS.map((t) => t.objectives.length)).toEqual([5, 3, 5, 9, 5, 7, 6, 5, 3, 3, 3, 2])
    expect(OBJECTIVE_BY_ID.size).toBe(56)
  })

  it('numbers objectives under their task', () => {
    for (const t of TASKS) {
      expect(t.id.startsWith(`${t.domainId}.`)).toBe(true)
      t.objectives.forEach((o, i) => expect(o.id).toBe(`${t.id}.${i + 1}`))
    }
    expect(taskOfObjective('2.3.5')?.title).toBe('Apply analytics to a worksheet')
  })

  it('has the exam format from the guide', () => {
    expect(EXAM_FORMAT).toMatchObject({ items: 40, minutes: 70, passPercent: 48, productVersion: '2022.3' })
  })

  it('allocates the mock 9 · 15 · 10 · 6', () => {
    expect([...allocateMock().values()]).toEqual([9, 15, 10, 6])
  })

  it('splits by largest remainder, deterministically', () => {
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(largestRemainder(600, [23, 37, 25, 15])).toEqual([138, 222, 150, 90])
  })

  it('sets the PLAN.md §4 task targets, at least 8 per objective', () => {
    expect([...TARGETS.tasks.values()]).toEqual([53, 32, 53, 95, 53, 74, 64, 54, 32, 34, 34, 22])
    expect(sum(TARGETS.tasks.values())).toBe(BANK_TARGET)
    for (const o of OBJECTIVES) expect(TARGETS.objectives.get(o.id)).toBeGreaterThanOrEqual(MIN_PER_OBJECTIVE)
  })

  it('orders lessons over every task exactly once', () => {
    expect([...LESSON_ORDER].sort()).toEqual(TASKS.map((t) => t.id))
  })
})

describe('Tableau Public limits', () => {
  it('names real objectives, and documented ones cite a source', async () => {
    const { PUBLIC_LIMITS } = await import('./blueprint')
    for (const l of PUBLIC_LIMITS) expect(OBJECTIVE_BY_ID.has(l.objectiveId), l.objectiveId).toBe(true)
    for (const l of PUBLIC_LIMITS.filter((x) => x.status === 'documented'))
      expect(l.source, l.objectiveId).toMatch(/^https:\/\/help\.tableau\.com\//)
  })
})
