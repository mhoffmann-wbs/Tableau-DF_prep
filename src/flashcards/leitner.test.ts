import { describe, expect, it } from 'vitest'
import { buildSession, type CardState, deckStats, intervalLabel, nextBox, rate } from './leitner'

const DAY = 86_400_000
const at = (box: number, due: number): CardState => ({ box, due, lastAt: 0 })

describe('Leitner scheduling', () => {
  it('moves cards between boxes 0–5', () => {
    expect(nextBox(undefined, 'good')).toBe(1)
    expect(nextBox(undefined, 'easy')).toBe(2)
    expect(nextBox(at(4, 0), 'easy')).toBe(5)
    expect(nextBox(at(5, 0), 'good')).toBe(5)
    expect(nextBox(at(5, 0), 'again')).toBe(0)
  })

  it('schedules by the box intervals 0, 1, 3, 7, 16 and 35 days', () => {
    expect([0, 1, 2, 3, 4].map((box) => rate(at(box, 0), 'good', 0).due / DAY)).toEqual([1, 3, 7, 16, 35])
    expect(rate(at(3, 0), 'again', 5)).toEqual({ box: 0, due: 5, lastAt: 5 })
    expect([0, 1, 5].map(intervalLabel)).toEqual(['now', '1 day', '35 days'])
  })

  it('builds a session of due cards, most overdue first, then a few new ones in deck order', () => {
    const states = { a: at(1, 50), b: at(2, 200), c: at(0, 10) }
    expect(buildSession(['a', 'b', 'c', 'd', 'e', 'f'], states, 100, 2)).toEqual(['c', 'a', 'd', 'e'])
    expect(deckStats(['a', 'b', 'c', 'd'], states, 100)).toEqual({ due: 2, fresh: 1, boxes: [1, 1, 1, 0, 0, 0] })
  })
})
