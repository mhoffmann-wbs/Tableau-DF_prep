// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { exportProgress, getProgress, importProgress, recordAnswer, recordMockResult, reloadProgress, resetProgress } from './store'

beforeEach(() => {
  localStorage.clear()
  resetProgress()
})

describe('progress store', () => {
  it('records attempts with a streak that a wrong answer resets', () => {
    recordAnswer('2.3-001', true, 1)
    recordAnswer('2.3-001', true, 2)
    expect(getProgress().items['2.3-001']).toMatchObject({ attempts: 2, correct: 2, streak: 2 })
    recordAnswer('2.3-001', false, 3)
    expect(getProgress().items['2.3-001']).toMatchObject({ attempts: 3, correct: 2, streak: 0, lastCorrect: false, lastAt: 3 })
  })

  it('persists to localStorage and survives a reload', () => {
    recordAnswer('3.1-001', true)
    recordMockResult({ at: 1, correct: 20, total: 40, percent: 50, passed: true, domains: [{ id: '1', correct: 5, total: 9 }], tasks: [] })
    reloadProgress()
    expect(getProgress().items['3.1-001']?.attempts).toBe(1)
    expect(getProgress().mockResults).toHaveLength(1)
  })

  it('discards unreadable or other-version data', () => {
    localStorage.setItem('tableau-df:progress', '{not json')
    reloadProgress()
    expect(getProgress().items).toEqual({})
    localStorage.setItem('tableau-df:progress', JSON.stringify({ version: 99, items: { a: 1 } }))
    reloadProgress()
    expect(getProgress().items).toEqual({})
  })

  it('round-trips an export and rejects bad files without changing anything', () => {
    recordAnswer('4.1-002', true)
    const file = exportProgress()
    resetProgress()
    importProgress(file)
    expect(getProgress().items['4.1-002']?.attempts).toBe(1)
    expect(() => importProgress('nope')).toThrow("isn't valid JSON")
    expect(() => importProgress('{"app":"other"}')).toThrow("isn't a Tableau-DF prep progress export")
    expect(() => importProgress(JSON.stringify({ app: 'tableau-df-prep', progress: { version: 1, items: { x: { attempts: -1 } } } }))).toThrow('damaged')
    expect(() => importProgress(JSON.stringify({ app: 'tableau-df-prep', progress: { version: 2 } }))).toThrow('newer version')
    expect(getProgress().items['4.1-002']?.attempts).toBe(1)
  })
})
