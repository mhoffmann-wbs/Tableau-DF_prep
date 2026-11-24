import { useState } from 'react'
import type { SimProps } from '.'
import { Choice } from './Choice'

export const COPY_KEYS = [
  'menuPath', 'filter', 'highlight', 'url', 'parameter', 'hover', 'select', 'menu',
  'clearLeave', 'clearAll', 'clearExclude', 'paramKeep', 'paramSet',
  'urlNote', 'urlMissing', 'filterVsHighlight', 'useAsFilter', 'showFilterNote',
  'try', 'effectIdle', 'effectFilter', 'effectFilterHeld', 'effectFilterExcluded', 'effectHighlight',
  'effectUrl', 'effectParam', 'effectParamHeld', 'sample',
] as const

// Invented sample data, not the Driftlight dataset.
export const GENRES = ['Drama', 'Comedy', 'Documentary', 'Sci-Fi'] as const
export const GENRE_CODE: Record<string, string> = { Drama: 'DRM', Comedy: 'CMD', Documentary: 'DOC', 'Sci-Fi': 'SCI' }
export type Plan = 'Basic' | 'Premium'
export interface Row {
  title: string
  genre: string
  plan: Plan
  minutes: number
}
export const ROWS: Row[] = [
  { title: 'Harbor Lights', genre: 'Drama', plan: 'Basic', minutes: 420 },
  { title: 'Night Ferry', genre: 'Drama', plan: 'Premium', minutes: 310 },
  { title: 'Paper Moons', genre: 'Comedy', plan: 'Basic', minutes: 280 },
  { title: 'Late Shift', genre: 'Comedy', plan: 'Premium', minutes: 350 },
  { title: 'Tide Maps', genre: 'Documentary', plan: 'Basic', minutes: 190 },
  { title: 'Salt Roads', genre: 'Documentary', plan: 'Premium', minutes: 240 },
  { title: 'Orbit Nine', genre: 'Sci-Fi', plan: 'Basic', minutes: 330 },
  { title: 'Glass Moon', genre: 'Sci-Fi', plan: 'Premium', minutes: 270 },
]

export type ActionType = 'filter' | 'highlight' | 'url' | 'parameter'
export type RunOn = 'hover' | 'select' | 'menu'
export type FilterClear = 'leave' | 'all' | 'exclude'
export type ParamClear = 'keep' | 'set'
export type UrlField = 'Genre' | 'Genre Code'

export interface ActionConfig {
  type: ActionType
  runOn: RunOn
  clear: FilterClear
  paramClear: ParamClear
  urlField: UrlField
  /** Whether the URL field is on the source sheet's Detail (Genre itself is always in the view). */
  codeOnDetail: boolean
}
export const DEFAULT_CONFIG: ActionConfig = { type: 'filter', runOn: 'select', clear: 'all', paramClear: 'set', urlField: 'Genre', codeOnDetail: false }

/** What the action currently holds: a member, all values, or (after a clear) no values. */
export type Held = { kind: 'member'; genre: string } | { kind: 'all' } | { kind: 'excluded' }
export const ALL: Held = { kind: 'all' }

/** The held state after the selection changes (`null` = cleared); the clearing options apply only to filter and parameter actions. */
export function nextHeld(config: ActionConfig, selected: string | null, held: Held): Held {
  if (selected !== null) return { kind: 'member', genre: selected }
  if (config.type === 'filter') return config.clear === 'leave' ? held : config.clear === 'all' ? ALL : { kind: 'excluded' }
  if (config.type === 'parameter') return config.paramClear === 'keep' ? held : ALL
  return ALL
}

export type MarkEvent = 'hover' | 'unhover' | 'click' | 'menu-link'
export type Reaction = 'select' | 'clear' | 'open-menu' | 'ignore'
/** What a mark event does, given Run action on. */
export function reactsTo(runOn: RunOn, event: MarkEvent): Reaction {
  if (runOn === 'hover') return event === 'hover' ? 'select' : event === 'unhover' ? 'clear' : 'ignore'
  if (runOn === 'select') return event === 'click' ? 'select' : 'ignore'
  return event === 'click' ? 'open-menu' : event === 'menu-link' ? 'select' : 'ignore'
}

export interface CardFilter {
  show: boolean
  plan: Plan | 'All'
  scope: 'sheet' | 'dashboard'
}
/** Rows a sheet draws after the Plan filter card (the card sits on Titles; its scope says whether Minutes by Genre follows). */
export function sheetRows(sheet: 'source' | 'target', card: CardFilter): Row[] {
  const applies = card.show && card.plan !== 'All' && (sheet === 'target' || card.scope === 'dashboard')
  return applies ? ROWS.filter((r) => r.plan === card.plan) : ROWS
}
export function genreTotals(rows: Row[]) {
  return GENRES.map((genre) => ({ genre, minutes: rows.filter((r) => r.genre === genre).reduce((a, r) => a + r.minutes, 0) }))
}

/** The target sheet's rows and whether each is dimmed. A filter action removes rows; a highlight action keeps them all and dims the rest. */
export function targetView(config: ActionConfig, held: Held, rows: Row[]): { row: Row; dimmed: boolean }[] {
  if (config.type === 'filter') {
    if (held.kind === 'excluded') return []
    return rows.filter((r) => held.kind === 'all' || r.genre === held.genre).map((row) => ({ row, dimmed: false }))
  }
  if (config.type === 'highlight' && held.kind === 'member') return rows.map((row) => ({ row, dimmed: row.genre !== held.genre }))
  return rows.map((row) => ({ row, dimmed: false }))
}

export function urlTemplate(config: ActionConfig) {
  return `https://example.com/browse?q=<${config.urlField}>`
}
/** The link a URL action would open. A field not used in the source view gives an empty value. */
export function buildUrl(config: ActionConfig, held: Held): { url: string; missing: boolean } | null {
  if (held.kind !== 'member') return null
  const inView = config.urlField === 'Genre' || config.codeOnDetail
  const value = !inView ? '' : config.urlField === 'Genre' ? held.genre : GENRE_CODE[held.genre]!
  return { url: urlTemplate(config).replace(`<${config.urlField}>`, encodeURIComponent(value)), missing: !inView }
}
export function parameterValue(held: Held): string {
  return held.kind === 'member' ? held.genre : 'All'
}

/** Which effect message to show. */
export function effectKey(config: ActionConfig, selected: string | null, held: Held): (typeof COPY_KEYS)[number] {
  if (config.type === 'filter') {
    if (held.kind === 'member') return selected === null ? 'effectFilterHeld' : 'effectFilter'
    return held.kind === 'excluded' ? 'effectFilterExcluded' : 'effectIdle'
  }
  if (config.type === 'parameter') {
    if (held.kind === 'member') return selected === null ? 'effectParamHeld' : 'effectParam'
    return 'effectIdle'
  }
  if (held.kind !== 'member') return 'effectIdle'
  return config.type === 'highlight' ? 'effectHighlight' : 'effectUrl'
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
const TYPE_LABEL: Record<ActionType, string> = { filter: 'Filter', highlight: 'Highlight', url: 'Go to URL', parameter: 'Change Parameter' }

/** Two canned sheets on a schematic dashboard, with one action wired between them. */
export default function DashboardActions({ copy }: SimProps) {
  const [config, setConfig] = useState<ActionConfig>(DEFAULT_CONFIG)
  const [selected, setSelected] = useState<string | null>(null)
  const [held, setHeld] = useState<Held>(ALL)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [card, setCard] = useState<CardFilter>({ show: false, plan: 'All', scope: 'sheet' })

  const reconfigure = (patch: Partial<ActionConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
    setSelected(null)
    setHeld(ALL)
    setMenuFor(null)
  }
  const choose = (genre: string | null, from: Held = held) => {
    setSelected(genre)
    setHeld(nextHeld(config, genre, from))
    setMenuFor(null)
  }
  const onEvent = (genre: string, event: MarkEvent) => {
    const r = reactsTo(config.runOn, event)
    if (r === 'select') choose(genre)
    else if (r === 'clear') choose(null)
    else if (r === 'open-menu') setMenuFor(genre)
  }

  const sourceTotals = genreTotals(sheetRows('source', card))
  const max = Math.max(...sourceTotals.map((t) => t.minutes), 1)
  const view = targetView(config, held, sheetRows('target', card))
  const url = config.type === 'url' ? buildUrl(config, held) : null
  const param = parameterValue(held)
  const key = effectKey(config, selected, held)
  const vars = { genre: held.kind === 'member' ? held.genre : '', url: url?.url ?? '', value: param }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{copy.sample}</p>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <p className="text-sm text-slate-700 sm:col-span-2">{copy.menuPath}</p>
        <Choice label="Action type" value={config.type} options={Object.entries(TYPE_LABEL) as [ActionType, string][]} onChange={(type) => reconfigure({ type })} />
        <Choice
          label="Run action on"
          value={config.runOn}
          options={[['hover', 'Hover'], ['select', 'Select'], ['menu', 'Menu']]}
          onChange={(runOn) => reconfigure({ runOn })}
        />
        {config.type === 'filter' && (
          <Choice
            label="Clearing the selection will"
            value={config.clear}
            options={[['leave', 'Leave the filter'], ['all', 'Show all values'], ['exclude', 'Exclude all values']]}
            onChange={(clear) => reconfigure({ clear })}
          />
        )}
        {config.type === 'parameter' && (
          <Choice
            label="Clearing the selection will"
            value={config.paramClear}
            options={[['keep', 'Keep current value'], ['set', 'Set value to All']]}
            onChange={(paramClear) => reconfigure({ paramClear })}
          />
        )}
        {config.type === 'url' && (
          <>
            <Choice label="Field in the URL" value={config.urlField} options={[['Genre', '<Genre>'], ['Genre Code', '<Genre Code>']]} onChange={(urlField) => reconfigure({ urlField })} />
            <Choice
              label="Genre Code on Detail"
              value={config.codeOnDetail ? 'yes' : 'no'}
              options={[['no', 'Not in the view'], ['yes', 'On Detail']]}
              onChange={(v) => reconfigure({ codeOnDetail: v === 'yes' })}
            />
          </>
        )}
        <p className="text-sm text-slate-600 sm:col-span-2">{copy[config.type]} {copy[config.runOn]}</p>
        {config.type === 'filter' && <p className="text-sm text-slate-600 sm:col-span-2">{copy[config.clear === 'leave' ? 'clearLeave' : config.clear === 'all' ? 'clearAll' : 'clearExclude']}</p>}
        {config.type === 'parameter' && <p className="text-sm text-slate-600 sm:col-span-2">{copy[config.paramClear === 'keep' ? 'paramKeep' : 'paramSet']}</p>}
        {config.type === 'url' && <p className="text-sm text-slate-600 sm:col-span-2">{copy.urlNote}</p>}
      </div>

      <p className="text-sm font-medium text-slate-700">{copy.try}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Source sheet: Minutes by Genre" className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-800">Minutes by Genre</h3>
          <ul className="mt-2 space-y-1.5">
            {sourceTotals.map(({ genre, minutes }) => (
              <li key={genre} className="relative">
                <button
                  type="button"
                  aria-pressed={selected === genre}
                  aria-label={`${genre}, ${minutes} minutes`}
                  onClick={() => onEvent(genre, 'click')}
                  onMouseEnter={() => onEvent(genre, 'hover')}
                  onMouseLeave={() => onEvent(genre, 'unhover')}
                  onFocus={() => onEvent(genre, 'hover')}
                  onBlur={() => onEvent(genre, 'unhover')}
                  className={`flex w-full items-center gap-2 rounded text-left text-xs ${selected === genre ? 'ring-2 ring-brand' : ''}`}
                >
                  <span className="w-20 shrink-0 text-slate-600">{genre}</span>
                  <span aria-hidden className="flex-1">
                    <span className="block h-5 rounded-sm bg-brand/70" style={{ width: `${(minutes / max) * 100}%` }} />
                  </span>
                  <span aria-hidden className="text-slate-500">{minutes}</span>
                </button>
                {menuFor === genre && (
                  <div role="menu" className="mt-1 rounded border border-slate-300 bg-chalk p-2 text-xs shadow">
                    <span className="block text-slate-500">{genre}: {minutes}</span>
                    <button type="button" role="menuitem" onClick={() => onEvent(genre, 'menu-link')} className="mt-1 rounded bg-brand px-2 py-1 text-chalk">
                      {TYPE_LABEL[config.type]}: {genre}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button type="button" disabled={selected === null && held.kind === 'all'} onClick={() => choose(null)} className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40">
            Clear selection
          </button>
        </section>

        <section aria-label="Target sheet: Titles" className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-800">Titles</h3>
          {card.show && (
            <div className="mt-2 space-y-2 rounded border border-dashed border-slate-300 p-2">
              <Choice label="Plan filter" value={card.plan} options={[['All', 'All'], ['Basic', 'Basic'], ['Premium', 'Premium']]} onChange={(plan) => setCard((c) => ({ ...c, plan }))} />
              <Choice
                label="Apply to Worksheets"
                value={card.scope}
                options={[['sheet', 'Only This Worksheet'], ['dashboard', 'Selected worksheets: All on dashboard']]}
                onChange={(scope) => setCard((c) => ({ ...c, scope }))}
              />
              <p className="text-xs text-slate-600">{copy.showFilterNote}</p>
            </div>
          )}
          <table aria-label="Titles" className="mt-2 w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr><th className="pr-2">Title</th><th className="pr-2">Genre</th><th className="pr-2">Plan</th><th>Minutes</th></tr>
            </thead>
            <tbody>
              {view.map(({ row, dimmed }) => (
                <tr key={row.title} data-dimmed={dimmed} className={dimmed ? 'text-slate-400 opacity-50' : 'text-slate-800'}>
                  <td className="pr-2">{row.title}</td><td className="pr-2">{row.genre}</td><td className="pr-2">{row.plan}</td><td>{row.minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Choice
          label="Filter card"
          value={card.show ? 'show' : 'hide'}
          options={[['hide', 'Hidden'], ['show', 'Show Filter']]}
          onChange={(v) => setCard((c) => ({ ...c, show: v === 'show', plan: 'All' }))}
        />
        <p className="self-end text-sm text-slate-600">{copy.useAsFilter}</p>
      </div>

      <div className="space-y-2 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm" aria-live="polite">
        <p>{fill(copy[key]!, vars)}</p>
        {url && (
          <p>
            <code className="break-all rounded bg-slate-100 px-1">{url.url}</code>
            {url.missing && <span className="mt-1 block text-slate-700">{copy.urlMissing}</span>}
          </p>
        )}
        {config.type === 'parameter' && (
          <p>
            Parameter <strong>Selected Genre</strong>: <code className="rounded bg-slate-100 px-1">{param}</code>
          </p>
        )}
        {(config.type === 'filter' || config.type === 'highlight') && <p className="text-slate-600">{copy.filterVsHighlight}</p>}
      </div>
    </div>
  )
}
