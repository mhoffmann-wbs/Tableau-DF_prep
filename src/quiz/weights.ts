// Blueprint weight of each task: its domain's weight shared among the domain's
// tasks by objective count, the same split as the bank targets (PLAN.md §4).
import { DOMAINS, tasksOf } from '../content/blueprint'

export const TASK_WEIGHTS: ReadonlyMap<string, number> = new Map(
  DOMAINS.flatMap((d) => {
    const tasks = tasksOf(d.id)
    const objectives = tasks.reduce((n, t) => n + t.objectives.length, 0)
    return tasks.map((t) => [t.id, (d.weight * t.objectives.length) / objectives] as const)
  }),
)
