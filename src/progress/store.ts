import { useSyncExternalStore } from 'react'
import { z } from 'zod'

// All persisted learner state lives behind this module. Bump VERSION, add a
// migration in `load()` and keep ProgressSchema in step whenever the shape
// changes; never read localStorage elsewhere.
const STORAGE_KEY = 'tableau-df:progress'
const VERSION = 3

export interface ItemStat {
  attempts: number
  correct: number
  lastCorrect: boolean
  lastAt: number
  /** Consecutive correct answers; a wrong answer resets it to 0. */
  streak: number
}

export interface ScoreRowRecord {
  id: string
  correct: number
  total: number
}

export interface MockResult {
  at: number
  correct: number
  total: number
  percent: number
  passed: boolean
  domains: ScoreRowRecord[]
  tasks: ScoreRowRecord[]
}

export interface Progress {
  version: typeof VERSION
  items: Record<string, ItemStat>
  mockResults: MockResult[]
  /** Sandbox "make this chart" challenges: id → when first completed. They don't count towards readiness. */
  sandbox: Record<string, number>
  /** Task ids of the lessons marked as read. */
  lessonsRead: string[]
}

function empty(): Progress {
  return { version: VERSION, items: {}, mockResults: [], sandbox: {}, lessonsRead: [] }
}

/** Brings stored or imported progress from an older version up to VERSION; other versions are returned unchanged. */
function migrate(raw: { version?: unknown }): { version?: unknown } {
  let doc: Record<string, unknown> & { version?: unknown } = raw
  // v1 → v2: sandbox challenge completions.
  if (doc.version === 1) doc = { ...doc, version: 2, sandbox: {} }
  // v2 → v3: lessons marked as read.
  if (doc.version === 2) doc = { ...doc, version: 3, lessonsRead: [] }
  return doc
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = migrate(JSON.parse(raw) as { version?: number })
    if (parsed.version !== VERSION) return empty()
    return { ...empty(), ...parsed } as Progress
  } catch {
    return empty()
  }
}

let state: Progress = load()
const listeners = new Set<() => void>()

function commit(next: Progress) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable (private mode, quota); keep in-memory state.
  }
  listeners.forEach((l) => l())
}

export function getProgress(): Progress {
  return state
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, getProgress)
}

export function recordAnswer(itemId: string, correct: boolean, at: number = Date.now()) {
  const prev = state.items[itemId] ?? { attempts: 0, correct: 0, lastCorrect: false, lastAt: 0, streak: 0 }
  commit({
    ...state,
    items: {
      ...state.items,
      [itemId]: {
        attempts: prev.attempts + 1,
        correct: prev.correct + (correct ? 1 : 0),
        lastCorrect: correct,
        lastAt: at,
        streak: correct ? prev.streak + 1 : 0,
      },
    },
  })
}

export function recordMockResult(result: MockResult) {
  commit({ ...state, mockResults: [...state.mockResults, result] })
}

export function recordSandboxChallenge(challengeId: string, at: number = Date.now()) {
  if (state.sandbox[challengeId] !== undefined) return
  commit({ ...state, sandbox: { ...state.sandbox, [challengeId]: at } })
}

export function setLessonRead(taskId: string, read: boolean) {
  const rest = state.lessonsRead.filter((id) => id !== taskId)
  commit({ ...state, lessonsRead: read ? [...rest, taskId] : rest })
}

// Imports come from files people pick, so they are validated in full before replacing anything.
const count = z.number().int().nonnegative()
const row = z.object({ id: z.string(), correct: count, total: count })
const ProgressSchema = z.object({
  version: z.literal(VERSION),
  items: z.record(z.string(), z.object({ attempts: count, correct: count, lastCorrect: z.boolean(), lastAt: z.number(), streak: count })),
  mockResults: z.array(
    z.object({ at: z.number(), correct: count, total: count, percent: z.number(), passed: z.boolean(), domains: z.array(row), tasks: z.array(row) }),
  ),
  sandbox: z.record(z.string(), z.number()),
  lessonsRead: z.array(z.string()),
})

const EXPORT_APP = 'tableau-df-prep'

/** The learner's progress as a JSON document they can save and import elsewhere. */
export function exportProgress(at: Date = new Date()): string {
  return JSON.stringify({ app: EXPORT_APP, exportedAt: at.toISOString(), progress: state }, null, 2)
}

/**
 * Replaces all progress with the contents of an export.
 * Throws an Error with a message for the learner if the file isn't a usable export.
 */
export function importProgress(json: string) {
  let doc: { app?: unknown; progress?: { version?: unknown } }
  try {
    doc = JSON.parse(json)
  } catch {
    throw new Error("This file isn't valid JSON.")
  }
  if (doc?.app !== EXPORT_APP || typeof doc.progress !== 'object' || doc.progress === null) {
    throw new Error("This file isn't a Tableau-DF prep progress export.")
  }
  const { version } = doc.progress
  if (typeof version === 'number' && version > VERSION) {
    throw new Error('This export comes from a newer version of the app. Reload the app, then import it again.')
  }
  const result = ProgressSchema.safeParse({ ...empty(), ...migrate(doc.progress) })
  if (!result.success) throw new Error('This export is damaged or incomplete, so nothing was imported.')
  commit(result.data)
}

export function resetProgress() {
  commit(empty())
}

/** Re-read from storage. Used by tests after manipulating localStorage directly. */
export function reloadProgress() {
  state = load()
  listeners.forEach((l) => l())
}
