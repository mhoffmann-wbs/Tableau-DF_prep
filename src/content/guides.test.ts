import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routes } from '../app/routes'
import { TASK_BY_ID } from './blueprint'
import { GUIDE_ORDER, GUIDES } from './guides'

const source = (id: string) => readFileSync(join(import.meta.dirname, 'guides', `${id}.mdx`), 'utf8')
const paths = routes[0]!.children!.map((r) => r.path).filter((p): p is string => p !== undefined)
/** Whether an app path matches a route (`:param` segments match anything). */
const routed = (path: string) =>
  path === '/' ||
  paths.some((p) => {
    const want = p.split('/')
    const got = path.replace(/^\//, '').split(/[?#]/)[0]!.split('/')
    return want.length === got.length && want.every((w, i) => w.startsWith(':') || w === got[i])
  })

describe('guides', () => {
  it('lists every guide once, in order, with its own id', () => {
    expect([...GUIDES.keys()].sort()).toEqual([...GUIDE_ORDER].sort())
  })

  it.each(GUIDE_ORDER)('%s cites real tasks and links to real pages', (id) => {
    const { meta } = GUIDES.get(id)!
    for (const t of meta.sources) expect(TASK_BY_ID.has(t), t).toBe(true)
    const text = source(id)
    for (const [, t] of text.matchAll(/<LessonLink id="([^"]+)"/g)) {
      expect(TASK_BY_ID.has(t!), t).toBe(true)
      expect(meta.sources, `${t} is linked, so list it in sources`).toContain(t)
    }
    for (const [, href] of text.matchAll(/\]\((\/[^)]*)\)/g)) expect(routed(href!), href).toBe(true)
  })

  it('types no exam-format number into the exam-day guide', () => {
    // Minutes, item counts, the pass mark and the fee come from EXAM_FORMAT through <Exam>, <Pace> and <PassCount>.
    const body = source('exam-day').replace(/^export const meta[\s\S]*?\n}\n/, '')
    expect(body).not.toMatch(/\b(40|45|70|48|75|2022\.3)\b/)
  })
})
