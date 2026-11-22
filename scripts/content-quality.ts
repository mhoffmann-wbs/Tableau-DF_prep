// Runs the anti-giveaway checks over the whole question bank (or the files
// given as arguments) and prints the key-letter spread.
// Run: npm run content:quality [-- <file.json> ...]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { QUALITY_CHECKS } from '../src/content/quality.ts'
import { type Item, selectCount } from '../src/content/schema.ts'

const dir = join(import.meta.dirname, '../src/content/questions')
const paths = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f))
const items = paths.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')) as Item[])

const singles = items.filter((i) => selectCount(i) === 1)
const spread: Record<string, number> = {}
for (const i of singles) {
  const letter = 'ABCDEF'[i.options.findIndex((o) => o.correct)]!
  spread[letter] = (spread[letter] ?? 0) + 1
}
console.log(`${items.length} items, ${singles.length} single-answer. Keys:`, spread)

let failed = false
for (const [name, check] of Object.entries(QUALITY_CHECKS)) {
  const problems = check(items)
  console.log(`${problems.length ? '✗' : '✓'} ${name}`)
  for (const p of problems) console.log(`    ${p}`)
  failed ||= problems.length > 0
}
process.exit(failed ? 1 : 0)
