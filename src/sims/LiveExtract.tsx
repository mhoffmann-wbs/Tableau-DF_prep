import { useState } from 'react'
import type { SimProps } from '.'
import { Inline } from '../components/Inline'
import { Choice } from './Choice'

export const COPY_KEYS = [
  'tableNote',
  'liveWhat',
  'extractWhat',
  'liveOffline',
  'extractOffline',
  'liveFresh',
  'extractStale',
  'extractCurrent',
  'filterNote',
  'aggregateNote',
  'incrementalBlocked',
  'fullRefresh',
  'incrementalNew',
  'incrementalMissed',
  'timing',
  'timingLive',
  'timingExtract',
  'filesIntro',
  'fileTwb',
  'fileTwbx',
  'fileTds',
  'fileTdsx',
  'fileHyper',
  'packagedFile',
  'packagedServerLive',
  'packagedServerExtract',
] as const

// ---- The model: a small invented table, not the Driftlight data. ----

export interface SourceRow {
  id: number
  year: 2024 | 2025
  plan: 'Basic' | 'Premium'
  minutes: number
}
export type Connection = 'live' | 'extract'
export type Origin = 'file' | 'server'
export type SourceSpeed = 'slow' | 'fast'
export type Refresh = 'full' | 'incremental'
export interface ExtractOptions {
  only2025: boolean
  aggregate: boolean
  refresh: Refresh
}
export interface StoredRow {
  year: number
  plan: string
  minutes: number
  /** How many source rows this stored row stands for. */
  rows: number
}

export const MAX_CHANGES = 6
/** Per press of "the source changes": rows added, and one earlier row corrected. */
export const NEW_ROWS_PER_CHANGE = 4
export const CORRECTION = 100

/** 16 sessions: ids 1–8 in 2024, 9–16 in 2025. */
export const SOURCE0: SourceRow[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  year: i < 8 ? 2024 : 2025,
  plan: i % 2 === 0 ? 'Basic' : 'Premium',
  minutes: 20 + ((i + 1) * 7) % 30,
}))

/** The source after `n` changes: each adds new 2025 rows and corrects the minutes of one row that already existed. */
export function applyChanges(n: number): SourceRow[] {
  const rows = SOURCE0.map((r) => ({ ...r }))
  for (let c = 1; c <= n; c++) {
    rows[c - 1]!.minutes += CORRECTION
    for (let k = 0; k < NEW_ROWS_PER_CHANGE; k++) {
      const id = rows.length + 1
      rows.push({ id, year: 2025, plan: id % 2 === 0 ? 'Premium' : 'Basic', minutes: 20 + (id * 7) % 30 })
    }
  }
  return rows
}

const keep = (r: SourceRow, o: ExtractOptions) => !o.only2025 || r.year === 2025

/** Creating the extract (or a full refresh): the filter applies, everything that passes is copied. */
export function buildExtract(source: SourceRow[], o: ExtractOptions): SourceRow[] {
  return source.filter((r) => keep(r, o)).map((r) => ({ ...r }))
}

/** Incremental refresh is not available together with aggregation. */
export function effectiveRefresh(o: ExtractOptions): Refresh {
  return o.aggregate ? 'full' : o.refresh
}

/** Full: replace all. Incremental: only rows whose id is above the extract's newest id (the column chosen to identify new rows). */
export function refreshExtract(extract: SourceRow[], source: SourceRow[], o: ExtractOptions): SourceRow[] {
  if (effectiveRefresh(o) === 'full') return buildExtract(source, o)
  const newest = extract.reduce((m, r) => Math.max(m, r.id), 0)
  return [...extract, ...source.filter((r) => r.id > newest && keep(r, o)).map((r) => ({ ...r }))]
}

/** What the file stores: every row, or one row per visible dimension combination (Year, Plan). */
export function storedRows(extract: SourceRow[], aggregate: boolean): StoredRow[] {
  if (!aggregate) return extract.map((r) => ({ year: r.year, plan: r.plan, minutes: r.minutes, rows: 1 }))
  return runView(extract.map((r) => ({ year: r.year, plan: r.plan, minutes: r.minutes, rows: 1 }))).map((g) => ({ ...g, rows: g.rows }))
}

/** The view: SUM(Minutes) by Year and Plan. */
export function runView(rows: StoredRow[]): StoredRow[] {
  const groups = new Map<string, StoredRow>()
  for (const r of rows) {
    const key = `${r.year}|${r.plan}`
    const g = groups.get(key)
    if (g) {
      g.minutes += r.minutes
      g.rows += r.rows
    } else groups.set(key, { ...r })
  }
  return [...groups.values()].sort((a, b) => a.year - b.year || a.plan.localeCompare(b.plan))
}

export function asStored(rows: SourceRow[]): StoredRow[] {
  return rows.map((r) => ({ year: r.year, plan: r.plan, minutes: r.minutes, rows: 1 }))
}

/** How far the extract is behind the source (as the extract's own filter would see it). */
export function staleness(extract: SourceRow[], source: SourceRow[], o: ExtractOptions): { missing: number; outdated: number } {
  const have = new Map(extract.map((r) => [r.id, r]))
  let missing = 0
  let outdated = 0
  for (const r of buildExtract(source, o)) {
    const e = have.get(r.id)
    if (!e) missing++
    else if (e.minutes !== r.minutes) outdated++
  }
  return { missing, outdated }
}

/** Illustrative only: a fixed cost to reach the data plus a cost per row read. The constants are made up. */
export const TIMING = {
  liveSlow: { base: 400, perRow: 8 },
  liveFast: { base: 30, perRow: 8 },
  extract: { base: 30, perRow: 8 },
} as const
export function illustrativeTime(conn: Connection, speed: SourceSpeed, rowsRead: number): number {
  const t = conn === 'extract' ? TIMING.extract : speed === 'slow' ? TIMING.liveSlow : TIMING.liveFast
  return t.base + t.perRow * rowsRead
}

export type FileType = 'twb' | 'twbx' | 'tds' | 'tdsx' | 'hyper'
export const FILES: FileType[] = ['twb', 'twbx', 'tds', 'tdsx', 'hyper']
export interface Holds {
  /** Worksheets, dashboards and stories. */
  sheets?: boolean
  /** Connection information and metadata (calculations, groups, sets, default properties). */
  metadata?: boolean
  /** The data itself. */
  data?: boolean
}

/** Whether a packaged file carries the data: local file data and extracts yes; live server data no. */
export function packagedData(conn: Connection, origin: Origin): boolean {
  return origin === 'file' || conn === 'extract'
}

/** What each file type holds, only where the lessons state it (undefined means the simulator makes no claim). */
export function fileHolds(file: FileType, conn: Connection, origin: Origin): Holds {
  switch (file) {
    case 'twb':
      return { sheets: true, data: false }
    case 'twbx':
      return { sheets: true, data: packagedData(conn, origin) }
    case 'tds':
      return { metadata: true, data: false }
    case 'tdsx':
      return { metadata: true, data: packagedData(conn, origin) }
    case 'hyper':
      return { data: conn === 'extract' }
  }
}

const mark = (v: boolean | undefined) => (v === undefined ? '–' : v ? 'Yes' : 'No')
const minutesLabel = (ms: number) => `${ms} ms`

/** Connection types side by side: freshness, offline use, extract settings, refresh kinds, illustrative timing and the files involved. */
export default function LiveExtract({ copy }: SimProps) {
  const [conn, setConn] = useState<Connection>('extract')
  const [origin, setOrigin] = useState<Origin>('server')
  const [speed, setSpeed] = useState<SourceSpeed>('slow')
  const [online, setOnline] = useState(true)
  const [changes, setChanges] = useState(0)
  const [opts, setOpts] = useState<ExtractOptions>({ only2025: false, aggregate: false, refresh: 'full' })
  const [extract, setExtract] = useState<SourceRow[]>(() => buildExtract(SOURCE0, { only2025: false, aggregate: false, refresh: 'full' }))
  const [lastRefresh, setLastRefresh] = useState<'full' | 'incremental' | undefined>()
  const [file, setFile] = useState<FileType>('twbx')

  const source = applyChanges(changes)
  const stored = storedRows(extract, opts.aggregate)
  const behind = staleness(extract, source, opts)
  const changeOptions = (next: ExtractOptions) => {
    setOpts(next)
    setExtract(buildExtract(source, next))
    setLastRefresh(undefined)
  }
  const refresh = () => {
    setExtract(refreshExtract(extract, source, opts))
    setLastRefresh(effectiveRefresh(opts))
  }

  const liveView = runView(asStored(source))
  const extractView = runView(stored)
  const keys = [...new Set([...liveView, ...extractView].map((g) => `${g.year}|${g.plan}`))].sort()
  const cell = (view: StoredRow[], k: string) => view.find((g) => `${g.year}|${g.plan}` === k)?.minutes
  const rowsRead = conn === 'live' ? source.length : stored.length
  const time = illustrativeTime(conn, speed, rowsRead)
  const reachable = conn === 'extract' || online

  const stale = behind.missing > 0 || behind.outdated > 0
  const explanation =
    conn === 'live'
      ? online
        ? changes > 0
          ? copy.liveFresh
          : copy.liveWhat
        : copy.liveOffline
      : !online
        ? copy.extractOffline
        : stale
          ? copy.extractStale
          : changes > 0
            ? copy.extractCurrent
            : copy.extractWhat
  const refreshNote =
    lastRefresh === 'incremental' ? (stale ? copy.incrementalMissed : copy.incrementalNew) : lastRefresh === 'full' ? copy.fullRefresh : undefined
  const holds = fileHolds(file, conn, origin)
  const fileNote = { twb: copy.fileTwb, twbx: copy.fileTwbx, tds: copy.fileTds, tdsx: copy.fileTdsx, hyper: copy.fileHyper }[file]
  const packagedNote =
    file === 'twbx' || file === 'tdsx'
      ? origin === 'file'
        ? copy.packagedFile
        : conn === 'extract'
          ? copy.packagedServerExtract
          : copy.packagedServerLive
      : undefined

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Choice
          label="Connection"
          value={conn}
          options={[
            ['live', 'Live'],
            ['extract', 'Extract'],
          ]}
          onChange={setConn}
        />
        <Choice
          label="Source database"
          value={online ? 'on' : 'off'}
          options={[
            ['on', 'Reachable'],
            ['off', 'Offline'],
          ]}
          onChange={(v) => setOnline(v === 'on')}
        />
        <Choice
          label="Live source speed (illustrative)"
          value={speed}
          options={[
            ['slow', 'Busy'],
            ['fast', 'Fast'],
          ]}
          onChange={setSpeed}
        />
        <div>
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">The source changes</span>
          <div className="mt-1">
            <button
              type="button"
              disabled={changes >= MAX_CHANGES || !online}
              onClick={() => setChanges(changes + 1)}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-40"
            >
              Add {NEW_ROWS_PER_CHANGE} rows, correct 1
            </button>
          </div>
        </div>
      </div>

      <p className="rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm" aria-live="polite">
        <Inline text={explanation!} />
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Extract settings">
          <h3 className="text-sm font-semibold text-slate-800">Extract settings</h3>
          <Choice
            label="Filter"
            value={opts.only2025 ? 'y25' : 'all'}
            options={[
              ['all', 'No filter'],
              ['y25', 'Year = 2025'],
            ]}
            disabled={!online}
            onChange={(v) => changeOptions({ ...opts, only2025: v === 'y25' })}
          />
          <Choice
            label="Aggregation"
            value={opts.aggregate ? 'agg' : 'rows'}
            options={[
              ['rows', 'Every row'],
              ['agg', 'Aggregate for visible dimensions (Year, Plan)'],
            ]}
            disabled={!online}
            onChange={(v) => changeOptions({ ...opts, aggregate: v === 'agg' })}
          />
          <Choice
            label="Refresh kind"
            value={effectiveRefresh(opts)}
            options={[
              ['full', 'Full'],
              ['incremental', 'Incremental'],
            ]}
            disabled={!online || opts.aggregate}
            onChange={(v) => setOpts({ ...opts, refresh: v })}
          />
          <p className="text-sm text-slate-600">
            {opts.aggregate && copy.incrementalBlocked} {opts.only2025 && copy.filterNote} {opts.aggregate && copy.aggregateNote}
          </p>
          <div>
            <button
              type="button"
              disabled={!online}
              onClick={refresh}
              className="rounded bg-brand px-3 py-1 text-sm text-chalk disabled:opacity-40"
            >
              Refresh extract
            </button>
          </div>
          <p className="text-sm text-slate-600" aria-live="polite">
            {refreshNote}
          </p>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Source rows</dt>
              <dd className="font-semibold">{source.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Rows stored in the extract</dt>
              <dd className="font-semibold">{stored.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Extract is behind by</dt>
              <dd className="font-semibold">
                {behind.missing} new, {behind.outdated} changed
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4" aria-label="The view">
          <h3 className="text-sm font-semibold text-slate-800">View: SUM(Minutes) by Year and Plan</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Year</th>
                <th>Plan</th>
                <th className={conn === 'live' ? 'text-brand' : ''}>Live</th>
                <th className={conn === 'extract' ? 'text-brand' : ''}>Extract</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const [y, p] = k.split('|')
                return (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1">{y}</td>
                    <td>{p}</td>
                    <td className={conn === 'live' ? 'font-semibold' : 'text-slate-500'}>{online ? (cell(liveView, k) ?? '–') : 'unreachable'}</td>
                    <td className={conn === 'extract' ? 'font-semibold' : 'text-slate-500'}>{cell(extractView, k) ?? '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">{copy.tableNote}</p>
          <div className="space-y-1" aria-live="polite">
            <p className="text-sm">
              Illustrative query time on the {conn} connection:{' '}
              <strong>{reachable ? minutesLabel(time) : 'no answer'}</strong> ({reachable ? `${rowsRead} rows read` : 'source unreachable'})
            </p>
            <div className="h-2 rounded bg-slate-100" aria-hidden="true">
              <div className="h-2 rounded bg-brand" style={{ width: reachable ? `${Math.min(100, (time / 600) * 100)}%` : '0%' }} />
            </div>
            <p className="text-xs text-slate-500">
              {copy.timing} {conn === 'live' ? copy.timingLive : copy.timingExtract}
            </p>
          </div>
        </section>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Files">
        <h3 className="text-sm font-semibold text-slate-800">Save as… and the files involved</h3>
        <p className="text-sm text-slate-600">{copy.filesIntro}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice label="File type" value={file} options={FILES.map((f) => [f, `.${f}`])} onChange={setFile} />
          <Choice
            label="Data comes from"
            value={origin}
            options={[
              ['file', 'A local file'],
              ['server', 'A database server'],
            ]}
            onChange={setOrigin}
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">.{file} holds</th>
              <th>Sheets</th>
              <th>Connection and metadata</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="py-1 text-slate-500">with {conn === 'live' ? 'a live' : 'an extract'} connection to {origin === 'file' ? 'a local file' : 'a server'}</td>
              <td>{mark(holds.sheets)}</td>
              <td>{mark(holds.metadata)}</td>
              <td className="font-semibold">{mark(holds.data)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-sm" aria-live="polite">
          <Inline text={fileNote!} /> {packagedNote}
        </p>
        <p className="text-xs text-slate-500">“–” means this simulator makes no statement about it.</p>
      </section>
    </div>
  )
}
