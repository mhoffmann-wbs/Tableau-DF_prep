// MDX components for the guides. Exam numbers come from EXAM_FORMAT and the
// blueprint, never typed into the guide text.
import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'
import { Link } from 'react-router'
import { DOMAINS, EXAM_FORMAT, TASK_BY_ID, allocateMock, tasksOf } from '../content/blueprint'
import { Callout } from '../lessons/components'

type ExamFact = keyof typeof EXAM_FORMAT

/** One fact from the exam guide, as EXAM_FORMAT holds it. */
export function Exam({ fact }: { fact: ExamFact }) {
  return <>{String(EXAM_FORMAT[fact])}</>
}

/** Seconds per item: for the scored items alone, and with every unscored item the exam may add. */
export const pace = {
  scored: Math.floor((EXAM_FORMAT.minutes * 60) / EXAM_FORMAT.items),
  all: Math.floor((EXAM_FORMAT.minutes * 60) / (EXAM_FORMAT.items + EXAM_FORMAT.unscoredMax)),
}

export function Pace({ of }: { of: keyof typeof pace }) {
  const s = pace[of]
  return (
    <>
      {Math.floor(s / 60)} min {s % 60} s
    </>
  )
}

/** Correct answers needed out of the scored items, if each counts the same. */
export const passCount = Math.ceil((EXAM_FORMAT.items * EXAM_FORMAT.passPercent) / 100)

export function PassCount() {
  return <>{passCount}</>
}

/** The domains with their weights, about how many of the scored items that is, and their tasks. */
export function DomainTable() {
  const share = allocateMock()
  return (
    <table>
      <thead>
        <tr>
          <th>Domain</th>
          <th>Weight</th>
          <th>≈ items of {EXAM_FORMAT.items}</th>
          <th>Tasks</th>
        </tr>
      </thead>
      <tbody>
        {DOMAINS.map((d) => (
          <tr key={d.id}>
            <td>
              {d.id}. {d.title}
            </td>
            <td>{d.weight}%</td>
            <td>{share.get(d.id)}</td>
            <td>
              {tasksOf(d.id)
                .map((t) => `${t.id} ${t.title}`)
                .join('; ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A link to a lesson, named by its task: <LessonLink id="2.2" />. */
export function LessonLink({ id }: { id: string }) {
  const task = TASK_BY_ID.get(id)
  if (!task) throw new Error(`No task ${id}`)
  return (
    <Link to={`/learn/${id}`}>
      {id} {task.title}
    </Link>
  )
}

function A({ href = '', ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) return <Link to={href} {...props} />
  return <a href={href} target="_blank" rel="noreferrer" {...props} />
}

export const guideComponents: MDXComponents = { Exam, Pace, PassCount, DomainTable, LessonLink, Callout, a: A }
