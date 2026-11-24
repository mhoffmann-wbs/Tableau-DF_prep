import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Dashboard } from '../build/Dashboard'
import { Sandbox } from '../build/Sandbox'
import { OBJECTIVE_BY_ID } from '../content/blueprint'
import { SANDBOX_CHALLENGES, SANDBOX_CHALLENGE_BY_ID, type SandboxChallenge } from '../content/sandbox'
import { emptyWorkbook, parseWorkbookHash, sheetName, type Workbook, workbookHash } from '../engine/dashboard'
import { emptySpec, parseSpecHash, specHash } from '../engine/edit'
import { type MatchResult, matchSpec } from '../engine/match'
import type { VizSpec } from '../engine/spec'
import { Viz } from '../engine/Viz'
import { recordSandboxChallenge, useProgress } from '../progress/store'

/**
 * The spec lives in the URL hash (#spec=…), so a reload keeps the work and a
 * link opens a preset. Each change replaces the history entry; Undo keeps its
 * own stack of earlier hashes.
 */
function useHashSpec(fallback: VizSpec) {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const [undo, setUndo] = useState<string[]>([])
  const parsed = useMemo(() => parseSpecHash(hash), [hash])
  const spec = parsed instanceof Error || parsed === undefined ? fallback : parsed
  const go = (next: string) => navigate({ hash: next }, { replace: true, preventScrollReset: true })
  return {
    spec,
    error: parsed instanceof Error ? parsed.message : undefined,
    set: (next: VizSpec) => {
      setUndo((u) => [...u, specHash(spec)])
      go(specHash(next))
    },
    canUndo: undo.length > 0,
    undo: () => {
      go(undo.at(-1)!)
      setUndo((u) => u.slice(0, -1))
    },
  }
}

function readWorkbookHash(hash: string): Workbook | Error | undefined {
  const spec = parseSpecHash(hash)
  if (spec !== undefined) return spec instanceof Error ? spec : emptyWorkbook(spec)
  return parseWorkbookHash(hash)
}

/** Like useHashSpec for the free sandbox's workbook: `#wb=`, or a `#spec=` link opened as Sheet 1. */
function useHashWorkbook() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const [undo, setUndo] = useState<string[]>([])
  const parsed = useMemo(() => readWorkbookHash(hash), [hash])
  const workbook = parsed instanceof Error || parsed === undefined ? emptyWorkbook() : parsed
  const go = (next: string) => navigate({ hash: next }, { replace: true, preventScrollReset: true })
  return {
    workbook,
    error: parsed instanceof Error ? parsed.message : undefined,
    set: (next: Workbook) => {
      setUndo((u) => [...u, workbookHash(workbook)])
      go(workbookHash(next))
    },
    canUndo: undo.length > 0,
    undo: () => {
      go(undo.at(-1)!)
      setUndo((u) => u.slice(0, -1))
    },
  }
}

export default function SandboxPage() {
  const { challengeId } = useParams()
  if (challengeId === undefined) return <FreeSandbox />
  const challenge = SANDBOX_CHALLENGE_BY_ID.get(challengeId)
  if (!challenge)
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Challenge not found</h1>
        <Link to="/build" className="text-brand-dark underline">
          All challenges
        </Link>
      </div>
    )
  // Keyed, so moving to the next challenge starts with fresh hints and feedback.
  return <ChallengeSandbox key={challenge.id} challenge={challenge} />
}

function Toolbar({ canUndo, onUndo, onReset, resetLabel }: { canUndo: boolean; onUndo: () => void; onReset: () => void; resetLabel: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <button type="button" disabled={!canUndo} onClick={onUndo} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">
        Undo
      </button>
      <button type="button" onClick={onReset} className="rounded border border-slate-300 px-3 py-1">
        {resetLabel}
      </button>
    </div>
  )
}

const DASHBOARD = 'dashboard'
type Tab = number | typeof DASHBOARD

function FreeSandbox() {
  const state = useHashWorkbook()
  const { workbook } = state
  const [tab, setTab] = useState<Tab>(0)
  const setSheet = (i: number, spec: VizSpec) => state.set({ ...workbook, sheets: workbook.sheets.map((s, j) => (j === i ? spec : s)) })
  const tabs: { id: Tab; label: string }[] = [...workbook.sheets.map((_, i) => ({ id: i, label: sheetName(i) })), { id: DASHBOARD, label: 'Dashboard 1' }]
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Viz builder sandbox</h1>
      <p className="text-slate-600">
        Build views from the Driftlight data the way you would in Tableau: drag fields from the Data pane to the shelves, or open a field to
        add it. Open a pill to change its aggregation, date level, discrete or continuous setting, or sort. Build two sheets and put them on
        the dashboard to try filter actions. The address bar always holds your work, so you can bookmark it or send it to someone.
      </p>
      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Sheets and dashboard" className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t border border-b-0 px-3 py-1 text-sm ${tab === t.id ? 'border-brand bg-white font-semibold' : 'border-slate-300 bg-slate-100'}`}
            >
              {t.id === DASHBOARD ? '▦ ' : ''}
              {t.label}
            </button>
          ))}
        </div>
        {tab === DASHBOARD ? (
          <Toolbar canUndo={state.canUndo} onUndo={state.undo} onReset={() => state.set({ ...workbook, dashboard: { layout: 'horizontal', actions: [] } })} resetLabel="Clear dashboard" />
        ) : (
          <Toolbar canUndo={state.canUndo} onUndo={state.undo} onReset={() => setSheet(tab, emptySpec(workbook.sheets[tab]!.source))} resetLabel="Clear sheet" />
        )}
      </div>
      {tab === DASHBOARD ? <Dashboard workbook={workbook} onChange={state.set} /> : <Sandbox key={tab} spec={workbook.sheets[tab]!} onChange={(spec) => setSheet(tab, spec)} />}
    </div>
  )
}

function ChallengeSandbox({ challenge }: { challenge: SandboxChallenge }) {
  const start = challenge.start ?? emptySpec(challenge.accept[0]!.source)
  const state = useHashSpec(start)
  const [result, setResult] = useState<MatchResult & { spec: string }>()
  const [hintsShown, setHintsShown] = useState(0)
  const solvedBefore = useProgress().sandbox[challenge.id] !== undefined
  // Feedback applies to the spec it was checked against; any edit clears it.
  const current = result?.spec === JSON.stringify(state.spec) ? result : undefined
  const index = SANDBOX_CHALLENGES.indexOf(challenge)
  const next = SANDBOX_CHALLENGES[index + 1]

  const check = () => {
    const r = matchSpec(state.spec, challenge.accept)
    setResult({ ...r, spec: JSON.stringify(state.spec) })
    if (r.ok) recordSandboxChallenge(challenge.id)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        <Link to="/build" className="text-brand-dark underline">
          Build
        </Link>{' '}
        › Make this chart {index + 1} of {SANDBOX_CHALLENGES.length}
      </p>
      <h1 className="text-3xl font-bold">
        {challenge.title}
        {solvedBefore && <span className="ml-2 align-middle text-base font-normal text-green-600">✓ solved</span>}
      </h1>
      <p className="text-slate-700">{challenge.prompt}</p>
      <p className="text-xs text-slate-500">
        {challenge.objectives.map((o) => `${o} ${OBJECTIVE_BY_ID.get(o)?.text ?? ''}`).join(' · ')}
      </p>
      <details open className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer font-semibold">Target chart</summary>
        <div className="mt-2">
          <Viz spec={challenge.accept[0]!} title="Target chart" />
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={check} className="rounded bg-brand px-4 py-1.5 text-chalk">
          Check my chart
        </button>
        {challenge.hints.length > 0 && (
          <button
            type="button"
            disabled={hintsShown === challenge.hints.length}
            onClick={() => setHintsShown((n) => n + 1)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Show a hint ({hintsShown} of {challenge.hints.length})
          </button>
        )}
        <Toolbar canUndo={state.canUndo} onUndo={state.undo} onReset={() => state.set(start)} resetLabel="Start over" />
      </div>
      {hintsShown > 0 && (
        <ul className="list-disc space-y-1 pl-6 text-sm text-slate-700">
          {challenge.hints.slice(0, hintsShown).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {current && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${current.ok ? 'border-green-600 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
          {current.ok ? (
            <>
              <p className="font-semibold">That’s the target chart.</p>
              <p className="mt-1">{challenge.debrief}</p>
              <p className="mt-2">
                {next ? (
                  <Link to={`/build/sandbox/${next.id}`} className="text-brand-dark underline">
                    Next challenge: {next.title}
                  </Link>
                ) : (
                  <Link to="/build" className="text-brand-dark underline">
                    Back to all challenges
                  </Link>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Not quite yet.</p>
              <ul className="mt-1 list-disc pl-5">
                {current.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          {state.error}
        </p>
      )}
      <Sandbox spec={state.spec} onChange={state.set} lockSource />
    </div>
  )
}
