// Tableau Public challenge tests (PLAN.md §7d): structure, ids used vs.
// declared, the files to download, the Public limits, and every checkpoint
// answer recomputed from the Driftlight data.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routes } from '../app/routes'
import { testDataset } from '../test/dataset'
import { OBJECTIVE_BY_ID, PUBLIC_LIMITS, TASKS } from './blueprint'
import { CHALLENGE_SECTIONS, CHALLENGES } from './challenges'
import { evaluateFact } from './facts'

const dir = join(import.meta.dirname, 'challenges')
const SOURCES = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => [f.replace(/\.mdx$/, ''), readFileSync(join(dir, f), 'utf8')]),
)
const DATA_DIR = join(import.meta.dirname, '../../public/data')
const data = testDataset()
const LIMITS = new Map(PUBLIC_LIMITS.map((l) => [l.objectiveId, l]))

const idsUsed = (source: string, component: string) => [...source.matchAll(new RegExp(`<${component} id="([^"]+)"`, 'g'))].map((m) => m[1]!)
const paths = routes[0]!.children!.map((r) => r.path).filter((p): p is string => p !== undefined)
/** Whether an app path matches a route (`:param` segments match anything). */
const routed = (path: string) =>
  paths.some((p) => {
    const want = p.split('/')
    const got = path.replace(/^\//, '').split(/[?#]/)[0]!.split('/')
    return want.length === got.length && want.every((w, i) => w.startsWith(':') || w === got[i])
  })

it('has one challenge per MDX file, named by id, and at least one per task', () => {
  expect(CHALLENGES.map((c) => c.meta.id).sort()).toEqual(Object.keys(SOURCES).sort())
  expect(TASKS.filter((t) => !CHALLENGES.some((c) => c.meta.taskId === t.id)).map((t) => t.id)).toEqual([])
})

describe.each(CHALLENGES.map((c) => [c.meta.id, c] as const))('challenge %s', (id, { meta }) => {
  const source = SOURCES[id]!

  it('practises real objectives, starting with its task', () => {
    for (const o of meta.objectives) expect(OBJECTIVE_BY_ID.has(o), o).toBe(true)
    expect(meta.objectives.some((o) => o.startsWith(`${meta.taskId}.`))).toBe(true)
  })

  it('has the required sections in order, with the downloads under Get the data', () => {
    const positions = CHALLENGE_SECTIONS.map((heading) => source.indexOf(`\n${heading}\n`))
    expect(CHALLENGE_SECTIONS.filter((_, i) => positions[i]! < 0), 'missing sections').toEqual([])
    expect([...positions].sort((x, y) => x - y), 'sections out of order').toEqual(positions)
    expect(source.slice(positions[1], positions[2])).toContain('<DataFiles />')
  })

  it('uses exactly its steps and checkpoints, in order, with unique ids', () => {
    expect(idsUsed(source, 'Step')).toEqual(meta.steps.map((s) => s.id))
    expect(idsUsed(source, 'Checkpoint')).toEqual(meta.checkpoints.map((c) => c.id))
    expect(new Set(meta.steps.map((s) => s.id)).size).toBe(meta.steps.length)
    expect(new Set(meta.checkpoints.map((c) => c.id)).size).toBe(meta.checkpoints.length)
  })

  it('downloads files that exist', () => {
    for (const f of meta.files) expect(existsSync(join(DATA_DIR, f)), f).toBe(true)
  })

  it('marks the steps Tableau Public can’t do (or may not) as optional', () => {
    expect(meta.steps.some((s) => !s.optional), 'needs a required step').toBe(true)
    for (const step of meta.steps) {
      const limit = step.objective ? LIMITS.get(step.objective) : undefined
      const expected = limit ? (limit.status === 'documented' ? 'free' : 'unverified') : undefined
      expect(step.optional, `${step.id}: ${limit?.note ?? 'no Public limit'}`).toBe(expected)
    }
    const stepObjectives = meta.steps.flatMap((s) => (s.objective ? [s.objective] : []))
    expect(stepObjectives.filter((o) => !meta.objectives.includes(o)), 'step objectives the challenge doesn\u2019t list').toEqual([])
  })

  it('links only to real pages', () => {
    for (const [, href] of source.matchAll(/\]\((\/[^)]*)\)/g)) expect(routed(href!), href).toBe(true)
  })

  it.each(meta.checkpoints.map((c) => [c.id, c] as const))('answers checkpoint %s as the data computes it', (_, checkpoint) => {
    expect(checkpoint.answer.says).toBe(evaluateFact(checkpoint.answer, data))
  })
})
