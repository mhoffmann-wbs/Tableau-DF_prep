// Lesson content tests: structure, coverage of the exam guide's objectives,
// and every embedded chart and data fact checked against the Driftlight data.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from 'vega-lite'
import { describe, expect, it } from 'vitest'
import { query } from '../engine/query'
import { toVegaLite } from '../engine/render'
import { testDataset } from '../test/dataset'
import { TASK_BY_ID } from './blueprint'
import { evaluateFact } from './facts'
import { LESSONS, REQUIRED_SECTIONS } from './lessons'

// Read the raw MDX from disk: the MDX plugin would compile a `?raw` import.
const dir = join(import.meta.dirname, 'lessons')
const SOURCES = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => [f.replace(/\.mdx$/, ''), readFileSync(join(dir, f), 'utf8')]),
)

const data = testDataset()
// Maps need the world shapes only to draw, not to compile.
const world = { type: 'Topology', objects: { countries: {} } } as const

const idsUsed = (source: string, component: string) => [...source.matchAll(new RegExp(`<${component} id="([^"]+)"`, 'g'))].map((m) => m[1]!)

it('has one lesson per task, one per MDX file', () => {
  expect([...LESSONS.keys()].sort()).toEqual(Object.keys(SOURCES).sort())
  expect([...TASK_BY_ID.keys()].filter((id) => !LESSONS.has(id))).toEqual([])
})

describe.each(Object.entries(SOURCES))('lesson %s', (fileId, source) => {
  const lesson = LESSONS.get(fileId)!
  const task = TASK_BY_ID.get(fileId)

  it('is named after its task and covers every objective', () => {
    expect(lesson, `${fileId}.mdx must export meta with taskId '${fileId}'`).toBeDefined()
    expect(task, `no task ${fileId}`).toBeDefined()
    expect([...lesson.meta.objectivesCovered].sort()).toEqual(task!.objectives.map((o) => o.id).sort())
  })

  it('has the required sections in order', () => {
    const positions = REQUIRED_SECTIONS.map((heading) => source.indexOf(`\n${heading}\n`))
    expect(
      REQUIRED_SECTIONS.filter((_, i) => positions[i]! < 0),
      'missing sections',
    ).toEqual([])
    expect([...positions].sort((x, y) => x - y), 'sections out of order').toEqual(positions)
  })

  it('has a How it works sub-heading for each objective and a <BuildLinks /> list', () => {
    const start = source.indexOf('\n## How it works\n')
    const section = source.slice(start, source.indexOf('\n## ', start + 1))
    expect(section.match(/\n### /g)?.length ?? 0).toBeGreaterThanOrEqual(task!.objectives.length)
    expect(source.slice(source.indexOf('\n## Build\n'))).toContain('<BuildLinks />')
  })

  it('uses exactly the charts and facts its meta declares', () => {
    expect([...new Set(idsUsed(source, 'LessonViz'))].sort()).toEqual(Object.keys(lesson.meta.vizzes).sort())
    expect([...new Set(idsUsed(source, 'Fact'))].sort()).toEqual(Object.keys(lesson.meta.facts).sort())
  })

  it.each(Object.entries(lesson.meta.vizzes))('draws viz %s over the data', (_, viz) => {
    const result = query(viz.spec, data)
    expect(result.rows.length).toBeGreaterThan(0)
    expect(() => compile(toVegaLite(viz.spec, result, { world }))).not.toThrow()
  })

  it.each(Object.entries(lesson.meta.facts))('states fact %s as the data computes it', (_, fact) => {
    expect(fact.says).toBe(evaluateFact(fact, data))
  })
})
