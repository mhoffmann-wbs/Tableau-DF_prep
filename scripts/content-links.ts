// Fetches every URL cited in the content (blueprint sources, item sourceLinks
// and lesson links) and reports broken ones. Needs network; not part of
// npm test. Run: npm run content:links
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { EXAM_FORMAT, PUBLIC_LIMITS } from '../src/content/blueprint.ts'

const root = join(import.meta.dirname, '../src/content')
const urls = new Map<string, string>()
const add = (url: string, where: string) => urls.set(url, urls.get(url) ?? where)

for (const key of ['guideUrl', 'certificateUrl', 'helpUrl'] as const) add(EXAM_FORMAT[key], 'blueprint')
for (const l of PUBLIC_LIMITS) if (l.source) add(l.source, `public limit ${l.objectiveId}`)
const qdir = join(root, 'questions')
for (const file of readdirSync(qdir).filter((f) => f.endsWith('.json'))) {
  for (const item of JSON.parse(readFileSync(join(qdir, file), 'utf8')) as { id: string; sourceLinks?: string[] }[]) {
    for (const u of item.sourceLinks ?? []) add(u, item.id)
  }
}

// Lesson MDX can't be imported from Node, so read the `url:` entries from the source.
const ldir = join(root, 'lessons')
for (const file of readdirSync(ldir).filter((f) => f.endsWith('.mdx'))) {
  for (const m of readFileSync(join(ldir, file), 'utf8').matchAll(/url: '([^']+)'/g)) add(m[1]!, `lesson ${file}`)
}

// help.salesforce.com and trailheadacademy render client-side, so a 200 is all
// we can check there; help.tableau.com serves real pages.
let broken = 0
for (const [url, where] of urls) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    const ok = res.ok
    if (!ok) broken++
    console.log(`${ok ? '✓' : '✗'} ${res.status} ${url}  (${where})`)
  } catch (e) {
    broken++
    console.log(`✗ ERR ${url}  (${where}): ${(e as Error).message}`)
  }
}
console.log(`\n${urls.size} URLs, ${broken} broken`)
process.exit(broken ? 1 : 0)
