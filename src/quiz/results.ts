// Scores a finished mock exam (or a practice session) by domain and task.
import { DOMAINS, EXAM_FORMAT, TASKS, TASK_BY_ID } from '../content/blueprint'
import type { Item } from '../content/schema'

export interface ScoreRow {
  id: string
  label: string
  correct: number
  total: number
}

export interface MockScore {
  correct: number
  total: number
  percent: number
  passed: boolean
  domains: ScoreRow[]
  tasks: ScoreRow[]
}

export const percent = (correct: number, total: number) => (total === 0 ? 0 : Math.round((correct / total) * 100))

const row = (id: string, label: string, items: readonly Item[], correct: (item: Item) => boolean): ScoreRow => ({
  id,
  label,
  correct: items.filter(correct).length,
  total: items.length,
})

/** One row per task that has items, in guide order. */
export const taskRows = (items: readonly Item[], correct: (item: Item) => boolean): ScoreRow[] =>
  TASKS.map((t) => row(t.id, t.title, items.filter((i) => i.taskId === t.id), correct)).filter((r) => r.total > 0)

export function scoreMock(items: readonly Item[], correct: (item: Item) => boolean): MockScore {
  const right = items.filter(correct).length
  return {
    correct: right,
    total: items.length,
    percent: percent(right, items.length),
    passed: percent(right, items.length) >= EXAM_FORMAT.passPercent,
    domains: DOMAINS.map((d) => row(d.id, d.title, items.filter((i) => TASK_BY_ID.get(i.taskId)?.domainId === d.id), correct)),
    tasks: taskRows(items, correct),
  }
}
