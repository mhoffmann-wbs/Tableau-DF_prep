import { useState } from 'react'
import { Link } from 'react-router'
import type { SimProps } from '.'
import { specHash } from '../engine/edit'
import { type VizSpec, vizSpecSchema } from '../engine/spec'
import { Choice } from './Choice'

export const KINDS = ['group', 'set', 'hierarchy', 'bin', 'parameter'] as const
export type Kind = (typeof KINDS)[number]
export const KIND_LABELS: Record<Kind, string> = { group: 'Group', set: 'Set', hierarchy: 'Hierarchy', bin: 'Bin', parameter: 'Parameter' }

const SCENARIO_COUNT = 9
const SCENARIO_KEYS = Array.from({ length: SCENARIO_COUNT }, (_, i) => i + 1).flatMap((n) => [`s${n}`, `s${n}Answer`, `s${n}Why`, `s${n}How`])

export const COPY_KEYS = [
  ...SCENARIO_KEYS,
  'viewGroup',
  'viewSet',
  'viewHierarchy',
  'viewBin',
  'viewParameter',
  'right',
  'wrong',
  'howLabel',
  'openSandbox',
  'done',
] as const

export interface Scenario {
  id: number
  text: string
  answer: Kind
  why: string
  how: string
}

/** The scenarios, from the copy, in order. Throws when an answer is not one of the five kinds. */
export function scenariosOf(copy: Record<string, string>): Scenario[] {
  return Array.from({ length: SCENARIO_COUNT }, (_, i) => {
    const n = i + 1
    const answer = copy[`s${n}Answer`] as Kind
    if (!KINDS.includes(answer)) throw new Error(`s${n}Answer must be one of ${KINDS.join(', ')}`)
    return { id: n, text: copy[`s${n}`]!, answer, why: copy[`s${n}Why`]!, how: copy[`s${n}How`]! }
  })
}

const topTitles = (n: number) => ({ name: `Top ${n} Titles`, field: 'Title', rule: { kind: 'top', from: 'top', n, field: 'Minutes Watched', agg: 'sum' } })
const byGenre = { rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched', agg: 'sum' } }], columns: [{ field: 'Minutes Watched' }] }

/**
 * The result of each request built on the Driftlight data, opened in the
 * sandbox from the answer (parameters have none: the engine has no parameters).
 */
export const PRESETS: Record<number, VizSpec> = Object.fromEntries(
  Object.entries({
    1: {
      source: 'subscribers',
      groups: [{ name: 'City (merged)', field: 'City', groups: [{ name: 'Cologne', members: ['Cologne', 'Köln'] }] }],
      rows: [{ field: 'City (merged)' }],
      columns: [{ field: 'Subscribers (Count)' }],
      filters: [{ kind: 'values', field: 'Country', values: ['Germany'] }],
    },
    2: { sets: [topTitles(20)], ...byGenre, marks: { color: { field: 'Top 20 Titles' } } },
    3: {
      source: 'titles',
      hierarchies: [{ name: 'Catalogue', fields: ['Type', 'Genre', 'Sub-Genre'] }],
      rows: [{ field: 'Type' }],
      columns: [{ field: 'Titles (Count)' }],
    },
    4: {
      bins: [{ name: 'Minutes Watched (bin)', field: 'Minutes Watched', size: 10 }],
      columns: [{ field: 'Minutes Watched (bin)' }],
      rows: [{ field: 'Minutes Watched', agg: 'count' }],
    },
    6: {
      groups: [
        {
          name: 'Genre (scripted)',
          field: 'Genre',
          groups: [
            { name: 'Scripted', members: ['Comedy', 'Drama', 'Sci-Fi & Fantasy', 'Thriller'] },
            { name: 'Unscripted', members: ['Documentary'] },
          ],
          other: true,
        },
      ],
      rows: [{ field: 'Genre (scripted)' }],
      columns: [{ field: 'Minutes Watched' }],
    },
    7: {
      sets: [
        {
          name: 'Picked Titles',
          field: 'Title',
          fixed: true,
          rule: { kind: 'members', members: ['The Restless Hive', 'The Midnight Atlas', 'The Electric Tide', 'The Crooked Archive', 'The Amber Kettle'] },
        },
      ],
      rows: [{ field: 'Picked Titles', setView: 'members' }],
      columns: [{ field: 'Minutes Watched' }],
    },
    9: { sets: [topTitles(10)], ...byGenre, marks: { color: { field: 'Top 10 Titles' } } },
  }).map(([id, spec]) => [Number(id), vizSpecSchema.parse(spec)]),
)

/** Right answers so far. `picks` maps a scenario id to the kind chosen. */
export function score(scenarios: Scenario[], picks: Record<number, Kind>) {
  const answered = scenarios.filter((s) => picks[s.id] !== undefined).length
  const correct = scenarios.filter((s) => picks[s.id] === s.answer).length
  return { answered, correct, total: scenarios.length, finished: answered === scenarios.length }
}

const VIEW_KEY: Record<Kind, 'viewGroup' | 'viewSet' | 'viewHierarchy' | 'viewBin' | 'viewParameter'> = {
  group: 'viewGroup',
  set: 'viewSet',
  hierarchy: 'viewHierarchy',
  bin: 'viewBin',
  parameter: 'viewParameter',
}

/** A schematic of the result: the Data pane entry on the left, the view on the right. Our own style, not Tableau's. */
export function Schematic({ kind }: { kind: Kind }) {
  const ink = 'currentColor'
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label={`Schematic of a ${kind}`} className="w-full max-w-md text-slate-600">
      <rect x="2" y="2" width="96" height="106" rx="6" fill="none" stroke={ink} strokeOpacity=".4" />
      <text x="10" y="18" fontSize="9" fill={ink}>
        Data pane
      </text>
      <rect x="10" y="26" width="80" height="20" rx="4" className="fill-brand/15" stroke="none" />
      {kind === 'group' && <path d="M22 30v10a4 4 0 0 0 8 0V32" fill="none" stroke={ink} strokeWidth="1.5" />}
      {kind === 'set' && (
        <>
          <circle cx="22" cy="36" r="5.5" fill="none" stroke={ink} />
          <circle cx="27" cy="36" r="5.5" fill="none" stroke={ink} />
        </>
      )}
      {kind === 'hierarchy' && <path d="M17 31v10m0-5h10m-10 5h10" fill="none" stroke={ink} strokeWidth="1.5" />}
      {kind === 'bin' && <path d="M18 42v-6m5 6v-10m5 10v-8" stroke={ink} strokeWidth="3" fill="none" />}
      {kind === 'parameter' && <path d="M16 36h14m-5-4 5 4-5 4" fill="none" stroke={ink} strokeWidth="1.5" />}
      <text x="36" y="40" fontSize="9" fill={ink}>
        {kind === 'hierarchy' ? 'Field › Field' : `New ${kind}`}
      </text>
      <rect x="106" y="2" width="212" height="106" rx="6" fill="none" stroke={ink} strokeOpacity=".4" />
      {kind === 'group' && (
        <>
          <rect x="116" y="20" width="90" height="22" className="fill-brand" />
          <rect x="116" y="50" width="60" height="22" className="fill-slate-400" />
          <text x="214" y="35" fontSize="9" fill={ink}>
            merged member
          </text>
          <text x="184" y="65" fontSize="9" fill={ink}>
            other member
          </text>
        </>
      )}
      {kind === 'set' && (
        <>
          <rect x="116" y="20" width="90" height="22" className="fill-brand" />
          <rect x="116" y="50" width="60" height="22" className="fill-slate-400" />
          <rect x="116" y="80" width="40" height="22" className="fill-slate-400" />
          <text x="214" y="35" fontSize="9" fill={ink}>
            In
          </text>
          <text x="184" y="65" fontSize="9" fill={ink}>
            Out
          </text>
          <text x="164" y="95" fontSize="9" fill={ink}>
            Out
          </text>
        </>
      )}
      {kind === 'hierarchy' && (
        <>
          <text x="116" y="26" fontSize="10" fill={ink}>
            + Type
          </text>
          <text x="126" y="48" fontSize="10" fill={ink}>
            − Type
          </text>
          <rect x="146" y="56" width="70" height="12" className="fill-brand" />
          <rect x="146" y="74" width="50" height="12" className="fill-brand" />
          <text x="222" y="66" fontSize="9" fill={ink}>
            nested Genre
          </text>
        </>
      )}
      {kind === 'bin' && (
        <>
          {[30, 55, 80, 60, 40, 20].map((h, i) => (
            <rect key={i} x={118 + i * 30} y={96 - h} width="28" height={h} className="fill-brand" />
          ))}
          <path d="M116 96h188" stroke={ink} />
        </>
      )}
      {kind === 'parameter' && (
        <>
          <rect x="116" y="18" width="110" height="22" rx="4" fill="none" stroke={ink} />
          <text x="124" y="33" fontSize="9" fill={ink}>
            one value ▾
          </text>
          <path d="M116 80h188" stroke={ink} strokeDasharray="4 3" />
          <rect x="130" y="60" width="30" height="40" className="fill-brand" />
          <rect x="180" y="48" width="30" height="52" className="fill-brand" />
          <rect x="230" y="68" width="30" height="32" className="fill-brand" />
        </>
      )}
    </svg>
  )
}

/** Request cards: pick the tool, then see the sketch of what it builds and how to create it. */
export default function GroupSet({ copy }: SimProps) {
  const scenarios = scenariosOf(copy)
  const [picks, setPicks] = useState<Record<number, Kind>>({})
  const [index, setIndex] = useState(0)
  const s = scenarios[index]!
  const pick = picks[s.id]
  const stats = score(scenarios, picks)
  const options = KINDS.map((k): [Kind, string] => [k, KIND_LABELS[k]])

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Request {index + 1} of {scenarios.length} · {stats.correct} right of {stats.answered} answered
      </p>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="font-medium">{s.text}</p>
        <Choice
          label="Which tool?"
          value={(pick ?? '') as Kind}
          options={options}
          disabled={pick !== undefined}
          onChange={(k) => setPicks((p) => ({ ...p, [s.id]: k }))}
        />
      </div>
      <div aria-live="polite">
        {pick !== undefined && (
          <div className="space-y-3 rounded-lg border border-brand/40 bg-brand/5 p-4 text-sm">
            <p>
              <strong>{pick === s.answer ? copy.right : copy.wrong}</strong> This is a {KIND_LABELS[s.answer].toLowerCase()}. {s.why}
            </p>
            <Schematic kind={s.answer} />
            <p>{copy[VIEW_KEY[s.answer]]}</p>
            <p>
              <strong>{copy.howLabel}:</strong> {s.how}
            </p>
            {PRESETS[s.id] && (
              <p>
                <Link to={`/build/sandbox${specHash(PRESETS[s.id]!)}`} className="text-brand-dark underline">
                  {copy.openSandbox}
                </Link>
              </p>
            )}
          </div>
        )}
        {stats.finished && (
          <p className="mt-3 font-semibold">
            Score: {stats.correct} / {stats.total}. {copy.done}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40">
          Previous
        </button>
        <button
          type="button"
          disabled={index === scenarios.length - 1}
          onClick={() => setIndex(index + 1)}
          className="rounded bg-brand px-3 py-1 text-sm text-chalk disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => {
            setPicks({})
            setIndex(0)
          }}
          className="rounded border border-slate-300 px-3 py-1 text-sm"
        >
          Start over
        </button>
      </div>
    </div>
  )
}
