// Builds practice sets and mock exams from the question bank. Callers pass the
// generator (sessionRng() in the app, a fixed seed in tests).
import { DOMAINS, EXAM_FORMAT, allocateMock, largestRemainder, tasksOf } from '../content/blueprint'
import type { Item } from '../content/schema'
import { type Rng, shuffle } from '../data/rng'

export interface MockExam {
  items: Item[]
  minutes: number
  /** How many items short of the full length the bank currently is. */
  shortfall: number
}

/** Shuffled, with items the learner hasn't seen before first. */
const unseenFirst = (items: readonly Item[], seen: ReadonlySet<string>, rng: Rng) => {
  const xs = shuffle(items, rng)
  return [...xs.filter((i) => !seen.has(i.id)), ...xs.filter((i) => seen.has(i.id))]
}

/**
 * Builds a mock exam: each domain gets its share of the 40 items (9 · 15 · 10 ·
 * 6), split among its tasks by objective count. A task that is short is made up
 * from the rest of its domain. Items the learner has seen come last. When the
 * bank is short, the time limit is scaled to the real pace.
 */
export function buildMockExam(bank: readonly Item[], seen: ReadonlySet<string>, rng: Rng): MockExam {
  const perDomain = allocateMock()
  const picked: Item[] = []
  for (const d of DOMAINS) {
    const tasks = tasksOf(d.id)
    const count = perDomain.get(d.id)!
    const quotas = largestRemainder(count, tasks.map((t) => t.objectives.length))
    const fromDomain: Item[] = []
    tasks.forEach((t, i) => fromDomain.push(...unseenFirst(bank.filter((item) => item.taskId === t.id), seen, rng).slice(0, quotas[i])))
    const rest = bank.filter((item) => tasks.some((t) => t.id === item.taskId) && !fromDomain.includes(item))
    fromDomain.push(...unseenFirst(rest, seen, rng).slice(0, count - fromDomain.length))
    picked.push(...fromDomain)
  }
  const items = shuffle(picked, rng)
  return {
    items,
    minutes: Math.max(1, Math.round((EXAM_FORMAT.minutes * items.length) / EXAM_FORMAT.items)),
    shortfall: EXAM_FORMAT.items - items.length,
  }
}

/**
 * Draws an untimed mixed practice set. It samples without replacement, with each
 * task's chance proportional to its blueprint weight (not its pool size), so
 * short sets match the blueprint on average.
 */
export function buildMixedSet(pool: readonly Item[], weights: ReadonlyMap<string, number>, size: number, rng: Rng): Item[] {
  const poolSize = new Map<string, number>()
  for (const i of pool) poolSize.set(i.taskId, (poolSize.get(i.taskId) ?? 0) + 1)
  // Efraimidis–Spirakis: key = u^(1/w); the largest keys form a weighted sample.
  const keyed = pool.map((item) => {
    const w = (weights.get(item.taskId) ?? 0) / (poolSize.get(item.taskId) ?? 1)
    return { item, key: w > 0 ? Math.pow(rng(), 1 / w) : -1 }
  })
  keyed.sort((a, b) => b.key - a.key)
  return shuffle(
    keyed.slice(0, size).map((k) => k.item),
    rng,
  )
}

/**
 * A "least mastered" mixed set: per-task counts come from the same weighted draw
 * as `buildMixedSet`; within each task, the items with the lowest correct-answer
 * streak are chosen (never answered counts as 0).
 */
export function buildFocusSet(
  pool: readonly Item[],
  weights: ReadonlyMap<string, number>,
  size: number,
  streakOf: (itemId: string) => number,
  rng: Rng,
): Item[] {
  const perTask = new Map<string, number>()
  for (const i of buildMixedSet(pool, weights, size, rng)) perTask.set(i.taskId, (perTask.get(i.taskId) ?? 0) + 1)
  const picked = [...perTask].flatMap(([id, count]) =>
    orderLeastMastered(
      pool.filter((i) => i.taskId === id),
      streakOf,
      rng,
    ).slice(0, count),
  )
  return shuffle(picked, rng)
}

/** Orders a whole pool lowest streak first, in random order within each streak. */
export function orderLeastMastered(pool: readonly Item[], streakOf: (itemId: string) => number, rng: Rng): Item[] {
  // Array.prototype.sort is stable, so the shuffle survives within each streak.
  return shuffle(pool, rng).sort((a, b) => streakOf(a.id) - streakOf(b.id))
}
