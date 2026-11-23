import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { Inline } from '../components/Inline'
import { ITEMS } from '../content/bank'
import { DOMAIN_BY_ID, LESSON_ORDER, TASK_BY_ID } from '../content/blueprint'
import { LESSONS } from '../content/lessons'
import { LessonContext, lessonComponents } from '../lessons/components'
import { setLessonRead, useProgress } from '../progress/store'

export default function LearnPage() {
  const { taskId } = useParams()
  return taskId ? <LessonView key={taskId} taskId={taskId} /> : <LessonIndex />
}

function LessonIndex() {
  const { lessonsRead } = useProgress()
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Learn</h1>
      <p className="max-w-3xl text-slate-600">
        One lesson per exam task: the big idea, how it works in Tableau, how Driftlight uses it, the traps the exam likes to set, and
        where to practise it. The lessons start with the concepts (domain 4) because everything else builds on them.{' '}
        {lessonsRead.length} of {LESSONS.size} marked as read.
      </p>
      <ol className="space-y-2">
        {LESSON_ORDER.map((id, i) => {
          const task = TASK_BY_ID.get(id)!
          const domain = DOMAIN_BY_ID.get(task.domainId)!
          return (
            <li key={id} className="flex items-baseline gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <span className="w-6 shrink-0 text-right font-mono text-sm text-slate-400">{i + 1}</span>
              <span className="flex-1">
                {LESSONS.has(id) ? (
                  <Link to={`/learn/${id}`} className="font-medium text-brand-dark hover:underline">
                    {id} {task.title}
                  </Link>
                ) : (
                  <span className="text-slate-400">
                    {id} {task.title} (coming soon)
                  </span>
                )}
                <span className="block text-xs text-slate-500">
                  Domain {domain.id}: {domain.title}
                </span>
              </span>
              <span className="w-4 shrink-0" aria-label={lessonsRead.includes(id) ? 'read' : undefined}>
                {lessonsRead.includes(id) ? '✓' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function LessonView({ taskId }: { taskId: string }) {
  const { lessonsRead } = useProgress()
  const task = TASK_BY_ID.get(taskId)
  const lesson = LESSONS.get(taskId)
  // The navigation sits at the bottom of the page, so start each lesson at the top
  // (the view is keyed by task, so this runs once per lesson).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  if (!task) {
    return (
      <p>
        No such task.{' '}
        <Link to="/learn" className="underline">
          Back to Learn
        </Link>
      </p>
    )
  }
  const domain = DOMAIN_BY_ID.get(task.domainId)!
  const read = lessonsRead.includes(taskId)
  const practiceCount = ITEMS.filter((i) => i.taskId === taskId).length

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-500">
          <Link to="/learn" className="hover:underline">
            Learn
          </Link>{' '}
          / Domain {domain.id}: {domain.title}
        </p>
        <h1 className="text-3xl font-bold">
          {task.id} {task.title}
        </h1>
        {lesson && <p className="text-sm text-slate-600">Tableau facts checked against the help on {lesson.meta.updated}</p>}
      </header>

      {lesson ? (
        <>
          <p className="rounded-lg border-l-4 border-brand bg-white p-4">
            <strong>In short:</strong> <Inline text={lesson.meta.tldr} />
          </p>
          <div className="prose max-w-none prose-a:text-brand-dark prose-code:before:content-none prose-code:after:content-none">
            <LessonContext value={lesson.meta}>
              <lesson.Content components={lessonComponents} />
            </LessonContext>
          </div>
        </>
      ) : (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">The lesson for this task is coming soon.</p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">What the exam guide covers</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {task.objectives.map((o) => (
              <li key={o.id}>
                <span className="mr-2 font-mono text-xs text-slate-400">{o.id}</span>
                {o.text}
              </li>
            ))}
          </ol>
        </div>
        {lesson && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Sources and further reading</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {lesson.meta.links.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noreferrer" className="text-brand-dark underline">
                    {link.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-3">
        {lesson && (
          <button
            onClick={() => setLessonRead(taskId, !read)}
            className={`rounded px-4 py-2 font-medium ${read ? 'border border-brand text-brand-dark' : 'bg-brand text-chalk'}`}
          >
            {read ? '✓ Marked as read' : 'Mark as read'}
          </button>
        )}
        {practiceCount > 0 && (
          <Link to={`/practice?task=${taskId}`} className="rounded border px-4 py-2">
            Practise this task ({practiceCount})
          </Link>
        )}
        {practiceCount > 0 && (
          <Link to={`/questions?task=${taskId}`} className="rounded border px-4 py-2">
            Browse its questions
          </Link>
        )}
      </footer>

      <LessonNav taskId={taskId} />
    </article>
  )
}

/** Previous and next lesson in learning order, skipping tasks without a lesson yet. */
function LessonNav({ taskId }: { taskId: string }) {
  const order = LESSON_ORDER.filter((id) => LESSONS.has(id) || id === taskId)
  const index = order.indexOf(taskId)
  const prev = order[index - 1]
  const next = order[index + 1]
  const card = (id: string, label: string, align: string) => (
    <Link to={`/learn/${id}`} className={`flex-1 rounded-lg border border-slate-200 bg-white p-4 hover:border-brand ${align}`}>
      <span className="block text-xs text-slate-500">{label}</span>
      <span className="font-medium text-brand-dark">
        {id} {TASK_BY_ID.get(id)!.title}
      </span>
    </Link>
  )
  return (
    <nav aria-label="Lesson navigation" className="flex gap-3 border-t border-slate-200 pt-6">
      {prev && card(prev, '← Previous lesson', '')}
      {next && card(next, 'Next lesson →', 'ml-auto text-right')}
    </nav>
  )
}
