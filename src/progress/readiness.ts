import type { Task } from '../content/blueprint'
import type { Item } from '../content/schema'
import type { ItemStat, Progress } from './store'

export interface TaskReadiness {
  taskId: string
  /** Share of the task's items answered at least once. */
  coverage: number
  /** Share of attempted items whose latest answer was correct (0 if none attempted). */
  accuracy: number
  /** coverage × accuracy: what fraction of the task's pool you can currently answer. */
  readiness: number
}

export function taskReadiness(tasks: readonly Task[], pool: readonly Item[], progress: Progress): TaskReadiness[] {
  return tasks.map((t) => {
    const items = pool.filter((i) => i.taskId === t.id)
    const attempted = items.filter((i) => progress.items[i.id])
    const correct = attempted.filter((i) => progress.items[i.id]!.lastCorrect)
    const coverage = items.length ? attempted.length / items.length : 0
    const accuracy = attempted.length ? correct.length / attempted.length : 0
    return { taskId: t.id, coverage, accuracy, readiness: coverage * accuracy }
  })
}

/** Overall readiness, weighted by the blueprint's task weights. */
export function weightedReadiness(rows: readonly TaskReadiness[], weights: ReadonlyMap<string, number>): number {
  const total = rows.reduce((sum, r) => sum + (weights.get(r.taskId) ?? 0), 0)
  if (total === 0) return 0
  return rows.reduce((sum, r) => sum + r.readiness * (weights.get(r.taskId) ?? 0), 0) / total
}

/**
 * Weak-spot drill: items from the lowest-readiness tasks, preferring items never
 * attempted or last answered wrong. Heavier tasks win ties.
 */
export function weakSpotItems(
  tasks: readonly Task[],
  pool: readonly Item[],
  progress: Progress,
  weights: ReadonlyMap<string, number>,
  taskCount = 3,
  size = 15,
): Item[] {
  const weakest = taskReadiness(
    tasks.filter((t) => pool.some((i) => i.taskId === t.id)),
    pool,
    progress,
  )
    .sort((a, b) => a.readiness - b.readiness || (weights.get(b.taskId) ?? 0) - (weights.get(a.taskId) ?? 0))
    .slice(0, taskCount)
    .map((r) => r.taskId)
  return pool.filter((i) => weakest.includes(i.taskId) && !progress.items[i.id]?.lastCorrect).slice(0, size)
}

export type Mastery = 'untested' | 'recentError' | 'reviewed' | 'alwaysCorrect'

/** Display order: the levels that need attention first. */
export const MASTERY_LEVELS: { id: Mastery; label: string; tone: string }[] = [
  { id: 'recentError', label: 'Recent error', tone: 'border-red-600 bg-red-50' },
  { id: 'reviewed', label: 'Past error, since correct', tone: 'border-amber-300 bg-amber-50' },
  { id: 'untested', label: 'Not tested', tone: 'border-slate-300 bg-slate-100' },
  { id: 'alwaysCorrect', label: 'Always correct', tone: 'border-green-600 bg-green-50' },
]

/** One item's mastery, from its latest answer and whether it was ever missed. */
export function masteryOf(stat: ItemStat | undefined): Mastery {
  if (!stat || stat.attempts === 0) return 'untested'
  if (!stat.lastCorrect) return 'recentError'
  return stat.correct < stat.attempts ? 'reviewed' : 'alwaysCorrect'
}
