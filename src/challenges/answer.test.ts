import { describe, expect, it } from 'vitest'
import type { ChallengeMeta, Fact } from '../content/schema'
import { answerMatches, challengeStatus, parseNumber } from './answer'

const value = (says: string, percent = false): Fact => ({ kind: 'value', says, spec: { source: 'sessions' } as Fact['spec'], measure: { field: 'x' }, digits: 0, percent })

describe('parseNumber', () => {
  it('reads separators, decimals, suffixes and percent signs', () => {
    expect(parseNumber('1,234')).toEqual({ value: 1234, tolerance: 0.5 })
    expect(parseNumber(' 12.50 % ')).toEqual({ value: 12.5, tolerance: 0.005 })
    expect(parseNumber('1.23K')).toEqual({ value: 1230, tolerance: 5 })
    expect(parseNumber('-2m')?.value).toBe(-2e6)
    expect(parseNumber('abc')).toBeUndefined()
    expect(parseNumber('1.2.3')).toBeUndefined()
  })
})

describe('answerMatches', () => {
  it('accepts the number as typed or as Tableau may format it', () => {
    expect(answerMatches('1234567', value('1,234,567'))).toBe(true)
    expect(answerMatches('1,234,567', value('1,234,567'))).toBe(true)
    expect(answerMatches('1.23M', value('1,234,567'))).toBe(true)
    expect(answerMatches('12.5', value('12.5%', true))).toBe(true)
    expect(answerMatches('12.5%', value('12.5%', true))).toBe(true)
  })

  it('rejects other numbers and too coarse a rounding', () => {
    expect(answerMatches('1234568', value('1,234,567'))).toBe(false)
    expect(answerMatches('1.2M', value('1,234,567'))).toBe(false)
    expect(answerMatches('', value('5'))).toBe(false)
    expect(answerMatches('five', value('5'))).toBe(false)
  })

  it('compares members without case or surrounding spaces', () => {
    const top: Fact = { kind: 'top', says: 'Mobile', spec: { source: 'sessions' } as Fact['spec'], dimension: { field: 'Device' }, measure: { field: 'x' }, order: 'desc' }
    expect(answerMatches(' mobile ', top)).toBe(true)
    expect(answerMatches('TV', top)).toBe(false)
  })
})

describe('challengeStatus', () => {
  const meta = {
    steps: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', optional: 'free' }],
    checkpoints: [{ id: 'c', question: 'Q', answer: value('1') }],
  } as ChallengeMeta

  it('is done when the required steps and every checkpoint are', () => {
    expect(challengeStatus(meta, undefined).done).toBe(false)
    expect(challengeStatus(meta, { steps: ['a'], checkpoints: [] }).done).toBe(false)
    expect(challengeStatus(meta, { steps: ['a'], checkpoints: ['c'] })).toEqual({ steps: 1, stepsTotal: 1, checkpoints: 1, checkpointsTotal: 1, done: true })
  })
})
