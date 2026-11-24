import type { MDXComponents } from 'mdx/types'
import { type ComponentProps, type ReactNode, createContext, use } from 'react'
import { Link } from 'react-router'
import type { LessonMeta } from '../content/schema'
import { CALC_EXERCISES } from '../content/calc'
import { FLASHCARDS } from '../content/flashcards'
import { SANDBOX_CHALLENGES } from '../content/sandbox'
import { specHash } from '../engine/edit'
import { Shelves } from '../engine/Shelves'
import { Viz } from '../engine/Viz'

// MDX components for lessons. Charts and data facts are declared in the
// lesson's `meta` and referenced by id, so content tests can query and draw
// every one of them without parsing MDX.
export const LessonContext = createContext<LessonMeta | undefined>(undefined)

function useMeta(): LessonMeta {
  const meta = use(LessonContext)
  if (!meta) throw new Error('Lesson components need a LessonContext')
  return meta
}

/** A chart from `meta.vizzes`: its shelves and/or the drawing, a caption and a link that opens it in the sandbox. */
export function LessonViz({ id }: { id: string }) {
  const viz = useMeta().vizzes[id]
  if (!viz) throw new Error(`Unknown lesson viz "${id}"`)
  return (
    <div className="not-prose my-6 space-y-2">
      {viz.show !== 'chart' && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-1">
          <Shelves spec={viz.spec} />
        </div>
      )}
      {viz.show !== 'shelves' && <Viz spec={viz.spec} title={viz.caption} />}
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
        <span>{viz.caption}</span>
        <Link to={`/build/sandbox${specHash(viz.spec)}`} className="shrink-0 text-brand-dark underline">
          Open in sandbox
        </Link>
      </p>
    </div>
  )
}

/** A value computed from the Driftlight data (`meta.facts`); a test checks the text against the query. */
export function Fact({ id }: { id: string }) {
  const fact = useMeta().facts[id]
  if (!fact) throw new Error(`Unknown lesson fact "${id}"`)
  return <strong>{fact.says}</strong>
}

/** A highlighted box for an exam trap or a key takeaway. */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="not-prose my-4 rounded-lg border-l-4 border-accent bg-white p-4">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 space-y-2 text-slate-700">{children}</div>
    </aside>
  )
}

/** The hands-on parts that practise this task: its sandbox challenges and the lesson's charts as sandbox presets. */
export function BuildLinks() {
  const meta = useMeta()
  const challenges = SANDBOX_CHALLENGES.filter((c) => c.objectives.some((o) => o.startsWith(`${meta.taskId}.`)))
  const presets = Object.values(meta.vizzes)
  const exercises = CALC_EXERCISES.filter((e) => e.objectives.some((o) => o.startsWith(`${meta.taskId}.`)))
  const cards = FLASHCARDS.filter((c) => c.taskId === meta.taskId).length
  return (
    <ul>
      {challenges.map((c) => (
        <li key={c.id}>
          Challenge: <Link to={`/build/sandbox/${c.id}`}>{c.title}</Link>
        </li>
      ))}
      {exercises.map((e) => (
        <li key={e.id}>
          Calc exercise: <Link to={`/build/calc/${e.id}`}>{e.title}</Link>
        </li>
      ))}
      {presets.map((v) => (
        <li key={v.caption}>
          Sandbox preset: <Link to={`/build/sandbox${specHash(v.spec)}`}>{v.caption}</Link>
        </li>
      ))}
      {cards > 0 && (
        <li>
          Flashcards: <Link to={`/build/flashcards?task=${meta.taskId}`}>{cards} cards for this task</Link>
        </li>
      )}
      {challenges.length + exercises.length + presets.length + cards === 0 && <li>Hands-on practice for this task arrives with the simulators and the Tableau Public challenges.</li>}
    </ul>
  )
}

/** Links starting with / go through the router (so the Pages base path applies); others open in a new tab. */
function A({ href = '', ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) return <Link to={href} {...props} />
  return <a href={href} target="_blank" rel="noreferrer" {...props} />
}

export const lessonComponents: MDXComponents = { LessonViz, Fact, Callout, BuildLinks, a: A }
