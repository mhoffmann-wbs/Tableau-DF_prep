// Content tests for the built-in flashcards: ids, objectives, coverage and no
// repeated fronts; plus the deck file format learners share.
import { describe, expect, it } from 'vitest'
import { OBJECTIVES, TASKS } from './blueprint'
import { DECK_FILE_APP, FLASHCARD_FILES, FLASHCARDS, parseDeckFile } from './flashcards'

/** Cards each objective needs before the deck counts as complete. */
const MIN_PER_OBJECTIVE = 3

describe('flashcards', () => {
  it('live in their task’s file, with unique ids and objectives under that task', () => {
    for (const task of Object.keys(FLASHCARD_FILES)) expect(TASKS.some((t) => t.id === task), task).toBe(true)
    const ids = FLASHCARDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of FLASHCARDS) {
      expect(c.id.startsWith(`${c.taskId}-c`), c.id).toBe(true)
      for (const o of c.objectives) {
        expect(o.startsWith(`${c.taskId}.`), `${c.id}: ${o}`).toBe(true)
        expect(OBJECTIVES.some((x) => x.id === o), `${c.id}: ${o}`).toBe(true)
      }
    }
  })

  it('have no repeated fronts', () => {
    const fronts = FLASHCARDS.map((c) => c.front.toLowerCase())
    expect(fronts.filter((f, i) => fronts.indexOf(f) !== i)).toEqual([])
  })

  it(`cover every objective of the tasks that have cards at least ${MIN_PER_OBJECTIVE} times`, () => {
    const short = TASKS.filter((t) => FLASHCARD_FILES[t.id])
      .flatMap((t) => t.objectives)
      .map((o) => [o.id, FLASHCARDS.filter((c) => c.objectives.includes(o.id)).length] as const)
      .filter(([, n]) => n < MIN_PER_OBJECTIVE)
    expect(short).toEqual([])
  })
})

describe('deck files', () => {
  const file = { app: DECK_FILE_APP, name: 'Mine', cards: [{ front: 'a', back: 'b' }] }

  it('read a valid deck and reject anything else', () => {
    expect(parseDeckFile(JSON.stringify(file))).toEqual(file)
    expect(() => parseDeckFile('{')).toThrow('valid JSON')
    expect(() => parseDeckFile(JSON.stringify({ ...file, app: 'x' }))).toThrow("isn't a Tableau-DF prep flashcard deck")
    expect(() => parseDeckFile(JSON.stringify({ ...file, cards: [{ front: ' ', back: 'b' }] }))).toThrow('damaged')
    expect(() => parseDeckFile(JSON.stringify({ ...file, cards: [] }))).toThrow('damaged')
  })
})
