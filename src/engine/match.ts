// Checks a learner's sandbox spec against a "make this chart" challenge
// (PLAN.md §7a). Two specs match when they would draw the same chart: the same
// pills (after defaults are resolved) on the same shelves, the same effective
// mark type and the same filters. Tooltip pills are ignored, Detail is
// unordered, and a sort only counts where the target sets one. No data needed.
import { type ResolvedPill, resolvePill } from './pills.ts'
import { automaticMark } from './render.ts'
import type { Filter, Pill, VizSpec } from './spec.ts'
import { SOURCE_INFO } from './model.ts'

export interface MatchResult {
  ok: boolean
  /** What still differs from the closest accepted spec, phrased as hints. */
  hints: string[]
}

const plural = (n: number) => `${n} pill${n === 1 ? '' : 's'}`

function comparePill(where: string, mine: ResolvedPill, target: ResolvedPill): string | undefined {
  if (mine.field.name !== target.field.name) return `${where} holds ${mine.label}, but the target uses a different field there.`
  if (mine.key === target.key) return undefined
  if (mine.agg !== target.agg) return `${where}: ${mine.label} needs a different aggregation.`
  if (mine.date?.level !== target.date?.level || mine.date?.mode !== target.date?.mode)
    return `${where}: ${mine.label} needs a different date level, or a date value instead of a date part (or the other way round).`
  return `${where}: ${mine.label} should be ${target.continuous ? 'continuous (green)' : 'discrete (blue)'}.`
}

function compareShelf(name: string, mine: ResolvedPill[], target: ResolvedPill[]): string[] {
  if (mine.length !== target.length) return [`${name} should hold ${plural(target.length)}; it holds ${mine.length}.`]
  return mine.map((p, i) => comparePill(mine.length > 1 ? `${name} (pill ${i + 1})` : name, p, target[i]!)).filter((h) => h !== undefined)
}

function compareSlot(name: string, mine: ResolvedPill | undefined, target: ResolvedPill | undefined): string[] {
  if (!mine && !target) return []
  if (!target) return [`${name} should be empty.`]
  if (!mine) return [`Something belongs on ${name}.`]
  const hint = comparePill(name, mine, target)
  return hint ? [hint] : []
}

function sortKey(spec: VizSpec, p: Pill): string {
  const s = p.sort
  if (!s) return 'none'
  const agg = s.field ? (s.agg ?? resolvePill(spec, { field: s.field }).agg) : undefined
  return JSON.stringify([s.order, s.field ?? null, agg ?? null, s.manual ?? null])
}

function filterKey(f: Filter): string {
  switch (f.kind) {
    case 'values':
      return JSON.stringify([f.kind, f.field, [...f.values].sort(), f.exclude ?? false])
    case 'range':
      return JSON.stringify([f.kind, f.field, f.agg ?? null, f.min ?? null, f.max ?? null])
    case 'dateRange':
      return JSON.stringify([f.kind, f.field, f.from ?? null, f.to ?? null])
    case 'datePart':
      return JSON.stringify([f.kind, f.field, f.level, f.values.map(Number).sort((a, b) => a - b)])
  }
}

/** What differs between a learner's spec and one accepted spec; empty when they match. */
export function differences(mine: VizSpec, target: VizSpec): string[] {
  if (mine.source !== target.source) return [`This chart is built from the ${SOURCE_INFO[target.source].label} data source.`]
  let m: ReturnType<typeof resolveAll>
  try {
    m = resolveAll(mine)
  } catch {
    return ['A pill in your view is broken (shown in red). Fix or remove it first.']
  }
  const t = resolveAll(target)
  const hints = [...compareShelf('Columns', m.columns, t.columns), ...compareShelf('Rows', m.rows, t.rows)]

  const markOf = (spec: VizSpec, r: typeof m) => (spec.marks.type === 'automatic' ? automaticMark(r.columns.at(-1), r.rows.at(-1)) : spec.marks.type)
  if (markOf(mine, m) !== markOf(target, t)) hints.push('The mark type isn’t right yet.')

  for (const ch of ['color', 'size', 'label', 'shape'] as const) hints.push(...compareSlot(ch[0]!.toUpperCase() + ch.slice(1), m[ch], t[ch]))
  const keys = (ps: ResolvedPill[]) => JSON.stringify(ps.map((p) => p.key).sort())
  if (keys(m.detail) !== keys(t.detail)) hints.push(`Detail should hold ${plural(t.detail.length)} that split the marks; check which fields are there.`)

  const filters = (spec: VizSpec) => JSON.stringify(spec.filters.map(filterKey).sort())
  if (filters(mine) !== filters(target)) hints.push('The Filters shelf isn’t right yet: check which field is filtered and which values are kept.')

  // Sorts count only where the target sets one, and only once the shelves agree.
  if (hints.length === 0) {
    for (const shelf of ['columns', 'rows'] as const)
      target[shelf].forEach((p, i) => {
        if (p.sort && sortKey(target, p) !== sortKey(mine, mine[shelf][i]!)) hints.push(`Sort ${t[shelf][i]!.label} the way the target does.`)
      })
  }
  return hints
}

function resolveAll(spec: VizSpec) {
  const r = (p: Pill) => resolvePill(spec, p)
  const opt = (p: Pill | undefined) => (p ? r(p) : undefined)
  return {
    columns: spec.columns.map(r),
    rows: spec.rows.map(r),
    color: opt(spec.marks.color),
    size: opt(spec.marks.size),
    label: opt(spec.marks.label),
    shape: opt(spec.marks.shape),
    detail: spec.marks.detail.map(r),
  }
}

/** Matches a spec against every accepted spec; hints come from the closest one. */
export function matchSpec(mine: VizSpec, accepted: VizSpec[]): MatchResult {
  let best: string[] | undefined
  for (const target of accepted) {
    const hints = differences(mine, target)
    if (hints.length === 0) return { ok: true, hints: [] }
    if (!best || hints.length < best.length) best = hints
  }
  return { ok: false, hints: best ?? [] }
}
