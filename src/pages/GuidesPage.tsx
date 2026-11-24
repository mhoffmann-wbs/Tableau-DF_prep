import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { INVENTED_DATA, NOT_AFFILIATED } from '../app/Layout'
import { EXAM_FORMAT, TASK_BY_ID } from '../content/blueprint'
import { GUIDE_ORDER, GUIDES } from '../content/guides'
import { guideComponents } from '../guides/components'

/** `/guides`: the print-ready guides; `/guides/:guideId`: one guide with a Print button. */
export default function GuidesPage() {
  const { guideId } = useParams()
  if (guideId) return <GuideView key={guideId} id={guideId} />
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Guides</h1>
        <p className="max-w-3xl text-slate-600">Short summaries to read the week before the exam, or to print and keep beside you while you study (not in the exam: no materials are allowed there).</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {GUIDE_ORDER.map((id) => {
          const { meta } = GUIDES.get(id)!
          return (
            <li key={id} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold">
                <Link to={`/guides/${id}`} className="text-brand-dark hover:underline">
                  {meta.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-slate-600">{meta.summary}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function GuideView({ id }: { id: string }) {
  const guide = GUIDES.get(id)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  if (!guide) {
    return (
      <p>
        No such guide.{' '}
        <Link to="/guides" className="underline">
          Back to Guides
        </Link>
      </p>
    )
  }
  const { meta, Content } = guide
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-slate-500 print:hidden">
          <Link to="/guides" className="hover:underline">
            Guides
          </Link>
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-bold print:text-xl">
            {meta.title}
            <span className="hidden print:inline"> · {EXAM_FORMAT.name}</span>
          </h1>
          <button type="button" onClick={() => window.print()} className="rounded bg-brand px-3 py-1.5 text-sm text-chalk print:hidden">
            Print
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Checked against the lessons and the exam guide on {meta.updated}.
        </p>
      </header>
      <div className="prose max-w-none prose-a:text-brand-dark prose-code:before:content-none prose-code:after:content-none print-compact">
        <Content components={guideComponents} />
      </div>
      {meta.sources.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm print:hidden">
          <h2 className="font-semibold">Lessons behind this guide</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {meta.sources.map((t) => (
              <li key={t}>
                <Link to={`/learn/${t}`} className="text-brand-dark hover:underline">
                  {t} {TASK_BY_ID.get(t)?.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="hidden border-t border-slate-300 pt-2 text-xs text-slate-500 print:block">
        <p>{NOT_AFFILIATED}</p>
        <p>{INVENTED_DATA}</p>
      </footer>
    </article>
  )
}
