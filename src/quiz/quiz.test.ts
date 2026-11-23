import { describe, expect, it } from 'vitest'
import { TASKS } from '../content/blueprint'
import { seededRng } from '../data/rng'
import { masteryOf, taskReadiness, weakSpotItems, weightedReadiness } from '../progress/readiness'
import type { Progress } from '../progress/store'
import { MULTI, SINGLE, VIZ, fakeBank, fakeItem } from '../test/fixtures'
import { grade, isAnswered, keyOf } from './grade'
import { scoreMock } from './results'
import { buildFocusSet, buildMixedSet, buildMockExam, orderLeastMastered } from './sampler'
import { TASK_WEIGHTS } from './weights'

describe('grading', () => {
  it('grades single-answer items by the chosen option', () => {
    expect(grade(SINGLE, [0])).toBe(true)
    expect(grade(SINGLE, [1])).toBe(false)
    expect(grade(SINGLE, [])).toBe(false)
    expect(isAnswered(SINGLE, [2])).toBe(true)
    expect(grade(VIZ, [0])).toBe(true)
  })

  it('grades multi-select items all or nothing, in any order', () => {
    expect(keyOf(MULTI)).toEqual([0, 1])
    expect(grade(MULTI, [1, 0])).toBe(true)
    expect(grade(MULTI, [0])).toBe(false)
    expect(grade(MULTI, [0, 2])).toBe(false)
    expect(isAnswered(MULTI, [0])).toBe(false)
    expect(isAnswered(MULTI, [0, 3])).toBe(true)
  })
})

describe('task weights', () => {
  it('share each domain weight among its tasks by objective count', () => {
    expect(TASK_WEIGHTS.get('2.1')).toBeCloseTo((37 * 9) / 21)
    expect(TASK_WEIGHTS.get('4.3')).toBeCloseTo((15 * 2) / 8)
    expect([...TASK_WEIGHTS.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(100)
  })
})

describe('mock exam', () => {
  const bank = fakeBank(10)
  const domainOf = (taskId: string) => taskId[0]

  it('draws 40 items split 9 · 15 · 10 · 6 by domain, in 70 minutes', () => {
    const mock = buildMockExam(bank, new Set(), seededRng(1))
    expect(mock).toMatchObject({ minutes: 70, shortfall: 0 })
    expect(new Set(mock.items.map((i) => i.id)).size).toBe(40)
    const perDomain = ['1', '2', '3', '4'].map((d) => mock.items.filter((i) => domainOf(i.taskId) === d).length)
    expect(perDomain).toEqual([9, 15, 10, 6])
  })

  it('splits a domain among its tasks by objective count', () => {
    const mock = buildMockExam(bank, new Set(), seededRng(2))
    // Domain 2: 15 items over 9 · 5 · 7 objectives.
    expect(['2.1', '2.2', '2.3'].map((t) => mock.items.filter((i) => i.taskId === t).length)).toEqual([6, 4, 5])
  })

  it('makes up a short task from the rest of its domain', () => {
    const short = bank.filter((i) => i.taskId !== '2.1' || i.id.endsWith('-001'))
    const mock = buildMockExam(short, new Set(), seededRng(3))
    expect(mock.items.filter((i) => domainOf(i.taskId) === '2')).toHaveLength(15)
    expect(mock.items.filter((i) => i.taskId === '2.1')).toHaveLength(1)
  })

  it('prefers items not seen before', () => {
    // Every task keeps 7 unseen items, more than its largest quota (6).
    const seen = new Set(bank.filter((i) => Number(i.id.slice(-3)) <= 3).map((i) => i.id))
    const mock = buildMockExam(bank, seen, seededRng(4))
    expect(mock.items.every((i) => !seen.has(i.id))).toBe(true)
  })

  it('scales the time when the bank is short', () => {
    const mock = buildMockExam(fakeBank(1), new Set(), seededRng(5))
    expect(mock.items).toHaveLength(12)
    expect(mock).toMatchObject({ shortfall: 28, minutes: 21 })
    expect(buildMockExam([], new Set(), seededRng(5))).toMatchObject({ items: [], shortfall: 40, minutes: 1 })
  })

  it('scores by domain and task and passes at 48%', () => {
    const items = [fakeItem('1.1', 1), fakeItem('1.2', 1), fakeItem('2.1', 1), fakeItem('4.3', 1)]
    const score = scoreMock(items, (i) => i.taskId.startsWith('1.'))
    expect(score).toMatchObject({ correct: 2, total: 4, percent: 50, passed: true })
    expect(score.domains.find((d) => d.id === '1')).toMatchObject({ correct: 2, total: 2 })
    expect(score.domains.find((d) => d.id === '3')).toMatchObject({ total: 0 })
    expect(score.tasks.map((t) => t.id)).toEqual(['1.1', '1.2', '2.1', '4.3'])
    expect(scoreMock(items, (i) => i.taskId === '1.1').passed).toBe(false)
  })
})

describe('practice sets', () => {
  const bank = ['1.1', '2.1', '4.3'].flatMap((t) => [1, 2, 3, 4].map((n) => fakeItem(t, n)))

  it('draws mixed sets of the requested size without repeats', () => {
    const set = buildMixedSet(bank, TASK_WEIGHTS, 6, seededRng(7))
    expect(set).toHaveLength(6)
    expect(new Set(set.map((i) => i.id)).size).toBe(6)
  })

  it('weights mixed sets by task, not by pool size', () => {
    const lopsided = [...fakeBank(1), ...Array.from({ length: 50 }, (_, i) => fakeItem('4.3', i + 2))]
    let fromSmallTask = 0
    for (let seed = 0; seed < 200; seed++) fromSmallTask += buildMixedSet(lopsided, TASK_WEIGHTS, 10, seededRng(seed)).filter((i) => i.taskId === '4.3').length
    // 4.3 weighs 3.75%: far below the 51/62 share its pool would give it.
    expect(fromSmallTask / 2000).toBeLessThan(0.3)
  })

  it('orders least mastered first and keeps focus sets to the lowest streaks', () => {
    const streak = (id: string) => (id.endsWith('-001') ? 0 : 3)
    expect(
      orderLeastMastered(bank, streak, seededRng(8))
        .slice(0, 3)
        .every((i) => i.id.endsWith('-001')),
    ).toBe(true)
    const focus = buildFocusSet(bank, TASK_WEIGHTS, 3, streak, seededRng(9))
    expect(focus).toHaveLength(3)
    // Each task drawn gives its streak-0 item first.
    for (const t of new Set(focus.map((i) => i.taskId))) expect(focus.map((i) => i.id)).toContain(`${t}-001`)
  })
})

describe('readiness', () => {
  const bank = ['1.1', '2.1'].flatMap((t) => [1, 2].map((n) => fakeItem(t, n)))
  const stat = (lastCorrect: boolean) => ({ attempts: 1, correct: lastCorrect ? 1 : 0, lastCorrect, lastAt: 0, streak: lastCorrect ? 1 : 0 })
  const progress: Progress = { version: 3, items: { '1.1-001': stat(true), '1.1-002': stat(false), '2.1-001': stat(true) }, mockResults: [], sandbox: {}, lessonsRead: [] }

  it('is coverage × accuracy per task, weighted by the guide', () => {
    const rows = taskReadiness(TASKS, bank, progress)
    expect(rows.find((r) => r.taskId === '1.1')).toMatchObject({ coverage: 1, accuracy: 0.5, readiness: 0.5 })
    expect(rows.find((r) => r.taskId === '2.1')).toMatchObject({ coverage: 0.5, accuracy: 1, readiness: 0.5 })
    expect(rows.find((r) => r.taskId === '3.1')).toMatchObject({ readiness: 0 })
    expect(weightedReadiness(rows.slice(0, 1), TASK_WEIGHTS)).toBe(0.5)
  })

  it('drills the weakest tasks with items not yet answered right', () => {
    expect(weakSpotItems(TASKS, bank, progress, TASK_WEIGHTS, 1).map((i) => i.id)).toEqual(['2.1-002'])
  })

  it('derives mastery levels', () => {
    expect(masteryOf(undefined)).toBe('untested')
    expect(masteryOf({ attempts: 2, correct: 1, lastCorrect: false, lastAt: 0, streak: 0 })).toBe('recentError')
    expect(masteryOf({ attempts: 2, correct: 1, lastCorrect: true, lastAt: 0, streak: 1 })).toBe('reviewed')
    expect(masteryOf({ attempts: 2, correct: 2, lastCorrect: true, lastAt: 0, streak: 2 })).toBe('alwaysCorrect')
  })
})
