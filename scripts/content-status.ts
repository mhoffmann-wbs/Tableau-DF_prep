// Prints question-bank coverage per task and objective against the PLAN.md §4
// targets, with the mix of item kinds. Run: npm run content:status
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DOMAINS, TARGETS, questionTarget, tasksOf } from '../src/content/blueprint.ts'

interface Raw {
  taskId: string
  objectives: string[]
  kind: string
}

const dir = join(import.meta.dirname, '../src/content/questions')
const items = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Raw[])

const mix = (xs: Raw[]) => {
  const k: Record<string, number> = {}
  for (const i of xs) k[i.kind] = (k[i.kind] ?? 0) + 1
  return Object.entries(k)
    .map(([kind, n]) => `${kind} ${n}`)
    .join(', ')
}

let have = 0
let want = 0
for (const d of DOMAINS) {
  console.log(`\n${d.id}. ${d.title} (${d.weight}%)`)
  for (const t of tasksOf(d.id)) {
    const inTask = items.filter((i) => i.taskId === t.id)
    const target = TARGETS.tasks.get(t.id)!
    have += Math.min(inTask.length, target)
    want += target
    console.log(`  ${inTask.length >= target ? '✓' : ' '} ${t.id} ${String(inTask.length).padStart(3)} / ${target}  ${mix(inTask)}`)
    for (const o of t.objectives) {
      // An item testing several objectives counts towards each of them.
      const n = inTask.filter((i) => i.objectives.includes(o.id)).length
      console.log(`      ${n >= questionTarget(o.id) ? '✓' : ' '} ${o.id.padEnd(6)} ${String(n).padStart(2)} / ${questionTarget(o.id)}`)
    }
  }
}
console.log(`\nQuestions: ${have} / ${want} (${Math.round((have / want) * 100)}%)  ${mix(items)}`)
