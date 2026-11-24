// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { exportProgress, getProgress, importProgress, recordAnswer, recordMockResult, recordCalcExercise, recordSandboxChallenge, reloadProgress, resetProgress, saveCalc, deleteCalc, setLessonRead } from './store'

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
    expect(() => importProgress(JSON.stringify({ app: 'tableau-df-prep', progress: { version: 5 } }))).toThrow('newer version')
    expect(getProgress().items['4.1-002']?.attempts).toBe(1)
  })

  it('keeps the first completion of a sandbox challenge', () => {
    recordSandboxChallenge('bar-genre-minutes', 5)
    recordSandboxChallenge('bar-genre-minutes', 9)
    expect(getProgress().sandbox).toEqual({ 'bar-genre-minutes': 5 })
  })

  it('marks lessons as read and unread', () => {
    setLessonRead('4.1', true)
    setLessonRead('1.1', true)
    setLessonRead('4.1', true)
    expect(getProgress().lessonsRead).toEqual(['1.1', '4.1'])
    setLessonRead('1.1', false)
    expect(getProgress().lessonsRead).toEqual(['4.1'])
  })

  it('migrates version 1 progress, stored or imported', () => {
    const v1 = { version: 1, items: { '2.1-001': { attempts: 1, correct: 1, lastCorrect: true, lastAt: 1, streak: 1 } }, mockResults: [] }
    localStorage.setItem('tableau-df:progress', JSON.stringify(v1))
    reloadProgress()
    expect(getProgress()).toMatchObject({ version: 4, sandbox: {}, lessonsRead: [], calcExercises: {}, calcs: [] })
    expect(getProgress().items['2.1-001']?.attempts).toBe(1)
    resetProgress()
    importProgress(JSON.stringify({ app: 'tableau-df-prep', progress: v1 }))
    expect(getProgress()).toMatchObject({ version: 4, sandbox: {}, lessonsRead: [], calcExercises: {}, calcs: [], items: v1.items })
  })

  it('saves calcs by source and name, and records calc exercises once', () => {
    saveCalc({ source: 'sessions', name: 'Hours', formula: '[Minutes Watched] / 60' }, 1)
    saveCalc({ source: 'titles', name: 'Hours', formula: '[Runtime] / 60' }, 2)
    saveCalc({ source: 'sessions', name: 'Hours', formula: '[Minutes Watched] / 60.0' }, 3)
    expect(getProgress().calcs.map((c) => [c.source, c.formula])).toEqual([
      ['titles', '[Runtime] / 60'],
      ['sessions', '[Minutes Watched] / 60.0'],
    ])
    deleteCalc('titles', 'Hours')
    expect(getProgress().calcs).toHaveLength(1)
    recordCalcExercise('hours-watched', 5)
    recordCalcExercise('hours-watched', 6)
    expect(getProgress().calcExercises).toEqual({ 'hours-watched': 5 })
    importProgress(exportProgress())
    expect(getProgress().calcs).toHaveLength(1)
  })
})
