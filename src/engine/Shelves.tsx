import { type ReactNode } from 'react'
import { AGG_LABEL, type ResolvedPill, resolvePill } from './pills'
import type { Filter, Pill, SourceId, VizSpec } from './spec'

/** A pill: blue when discrete, green when continuous, as in Tableau. */
export function PillChip({ source, pill }: { source: SourceId; pill: Pill }) {
  let rp: ResolvedPill
  try {
    rp = resolvePill(source, pill)
  } catch {
    return <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-medium text-white">{pill.field} ?</span>
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${rp.continuous ? 'bg-continuous' : 'bg-discrete'}`}>
      {rp.label}
      <span className="sr-only"> ({rp.continuous ? 'continuous' : 'discrete'})</span>
    </span>
  )
}

function filterLabel(f: Filter): string {
  if (f.kind === 'datePart') return `${f.level.toUpperCase()}(${f.field})`
  if (f.kind === 'range' && f.agg) return `${AGG_LABEL[f.agg]}(${f.field})`
  return f.field
}

function Shelf({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={`${name} shelf`} className="flex min-h-8 flex-wrap items-center gap-1.5 border-b border-slate-200 py-1 last:border-b-0">
      <span className="w-20 shrink-0 text-xs font-semibold tracking-wide text-slate-500 uppercase">{name}</span>
      {children}
    </div>
  )
}

/** The shelves and Marks card of a spec, read-only. */
export function Shelves({ spec }: { spec: VizSpec }) {
  const { source, marks } = spec
  const channels: [string, Pill | undefined][] = [
    ['Color', marks.color],
    ['Size', marks.size],
    ['Label', marks.label],
    ['Shape', marks.shape],
    ...marks.detail.map((p): [string, Pill] => ['Detail', p]),
    ...marks.tooltip.map((p): [string, Pill] => ['Tooltip', p]),
  ]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm">
      {spec.filters.length > 0 && (
        <Shelf name="Filters">
          {spec.filters.map((f, i) => (
            <span key={i} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs">
              {filterLabel(f)}
            </span>
          ))}
        </Shelf>
      )}
      <Shelf name="Marks">
        <span className="text-xs text-slate-600 capitalize">{marks.type}</span>
        {channels
          .filter((c): c is [string, Pill] => c[1] !== undefined)
          .map(([channel, pill], i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{channel}</span>
              <PillChip source={source} pill={pill} />
            </span>
          ))}
      </Shelf>
      <Shelf name="Columns">
        {spec.columns.map((p, i) => (
          <PillChip key={i} source={source} pill={p} />
        ))}
      </Shelf>
      <Shelf name="Rows">
        {spec.rows.map((p, i) => (
          <PillChip key={i} source={source} pill={p} />
        ))}
      </Shelf>
    </div>
  )
}
