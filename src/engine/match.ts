// Checks a learner's sandbox spec against a "make this chart" challenge
// (PLAN.md §7a). Two specs match when they would draw the same chart: the same
// pills (after defaults are resolved) on the same shelves, the same effective
// mark type for each measure, the same axes, Measure Values card, filters,
// reference items and totals. Tooltip pills and reference labels are ignored,
// Detail is unordered, and a sort only counts where the target sets one. No
// data needed.
import { type ResolvedPill, resolvePill } from './pills.ts'
import { automaticMark } from './render.ts'
import type { Filter, Pill, Ref, VizSpec } from './spec.ts'
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
  const hints = [...compareDerived(mine, target), ...compareShelf('Columns', m.columns, t.columns), ...compareShelf('Rows', m.rows, t.rows)]

  // Only compare marks and axes once the shelves agree, so the measures line up.
  if (hints.length === 0) {
    const mineMarks = marksOf(mine, m)
    const targetMarks = marksOf(target, t)
    if (targetMarks.length === 1) {
      if (mineMarks[0]!.mark !== targetMarks[0]!.mark) hints.push('The mark type isn’t right yet.')
    } else targetMarks.forEach((tm, i) => mineMarks[i]!.mark !== tm.mark && hints.push(`The mark type for ${tm.label} isn’t right yet.`))
    for (const shelf of ['columns', 'rows'] as const) {
      const name = shelf === 'columns' ? 'Columns' : 'Rows'
      const [mineAxis, targetAxis] = [mine.axes[shelf] ?? {}, target.axes[shelf] ?? {}]
      if (!!mineAxis.dual !== !!targetAxis.dual) hints.push(targetAxis.dual ? `The two measures on ${name} share one pane in the target: use Dual Axis.` : `${name} shouldn’t be a dual axis.`)
      else if (targetAxis.dual && !!mineAxis.sync !== !!targetAxis.sync) hints.push(targetAxis.sync ? `Synchronize the dual axis on ${name}.` : `The dual axis on ${name} isn’t synchronized in the target.`)
    }
  }

  const card = (spec: VizSpec) => JSON.stringify(spec.measureValues.map((p) => resolvePill(spec, p).key))
  if (card(mine) !== card(target))
    hints.push(`The Measure Values card should hold ${plural(target.measureValues.length)}: check which measures are there, and their order.`)

  for (const ch of ['color', 'size', 'label', 'shape'] as const) hints.push(...compareSlot(ch[0]!.toUpperCase() + ch.slice(1), m[ch], t[ch]))
  const keys = (ps: ResolvedPill[]) => JSON.stringify(ps.map((p) => p.key).sort())
  if (keys(m.detail) !== keys(t.detail)) hints.push(`Detail should hold ${plural(t.detail.length)} that split the marks; check which fields are there.`)

  const filters = (spec: VizSpec) => JSON.stringify(spec.filters.map(filterKey).sort())
  if (filters(mine) !== filters(target)) hints.push('The Filters shelf isn’t right yet: check which field is filtered and which values are kept.')

  const refs = (spec: VizSpec) => JSON.stringify(spec.refs.map((ref) => refKey(spec, ref)).sort())
  if (refs(mine) !== refs(target)) hints.push('The reference lines aren’t right yet: check each one’s measure, scope (Table, Pane or Cell) and value.')

  const totals = (spec: VizSpec) => {
    const { row, column, subtotals, using } = spec.totals
    return JSON.stringify([!!row, !!column, !!subtotals, row || column || subtotals ? (using ?? 'automatic') : null])
  }
  if (totals(mine) !== totals(target)) hints.push('The totals aren’t right yet: check Analysis > Totals.')

  // Sorts count only where the target sets one, and only once the shelves agree.
  if (hints.length === 0) {
    for (const shelf of ['columns', 'rows'] as const)
      target[shelf].forEach((p, i) => {
        if (p.sort && sortKey(target, p) !== sortKey(mine, mine[shelf][i]!)) hints.push(`Sort ${t[shelf][i]!.label} the way the target does.`)
      })
  }
  return hints
}

const formulaKey = (formula: string) => formula.replace(/\s+/g, '').toLowerCase()

/**
 * The target's calcs, groups, sets and bins, each defined the same way in
 * mine under the same name: formulas compare without spaces or case, groups by
 * which members they put together, members as sets.
 */
function compareDerived(mine: VizSpec, target: VizSpec): string[] {
  const sorted = (xs: string[]) => [...xs].sort()
  const keys = {
    calc: (c: VizSpec['calcs'][number]) => formulaKey(c.formula),
    // Which members go together; what each group is called is the learner's choice.
    group: (g: VizSpec['groups'][number]) => JSON.stringify([g.field, sorted(g.groups.map((x) => JSON.stringify(sorted(x.members)))), !!g.other]),
    set: (x: VizSpec['sets'][number]) =>
      JSON.stringify([x.field, !!x.fixed, x.rule.kind === 'members' ? { ...x.rule, members: sorted(x.rule.members), exclude: !!x.rule.exclude } : x.rule]),
    bin: (b: VizSpec['bins'][number]) => JSON.stringify([b.field, b.size]),
  }
  const check = <T extends { name: string }>(kind: string, ours: T[], theirs: T[], key: (x: T) => string) =>
    theirs.flatMap((want) => {
      const got = ours.find((x) => x.name === want.name)
      if (!got) return [`The target uses a ${kind} named ${want.name}: create it (or rename yours to that name).`]
      return key(got) === key(want) ? [] : [`${want.name} isn’t defined the way the target’s ${kind} is yet.`]
    })
  return [
    ...check('calculated field', mine.calcs, target.calcs, keys.calc),
    ...check('group', mine.groups, target.groups, keys.group),
    ...check('set', mine.sets, target.sets, keys.set),
    ...check('bin field', mine.bins, target.bins, keys.bin),
  ]
}

/** A reference item without its label: what it draws. */
function refKey(spec: VizSpec, ref: Ref): string {
  const { label: _label, custom: _custom, measure, ...rest } = ref
  return JSON.stringify([resolvePill(spec, measure).key, rest])
}

/**
 * Each measure's effective mark when a shelf holds several (its own, else the
 * sheet's, else Automatic's for its axes), or the sheet's one mark.
 */
function marksOf(spec: VizSpec, r: ReturnType<typeof resolveAll>): { label: string; mark: string }[] {
  const many = (ps: ResolvedPill[]) => ps.filter((p) => p.kind === 'measure' && p.continuous)
  const shelf = many(r.columns).length > 1 ? 'columns' : many(r.rows).length > 1 ? 'rows' : undefined
  const sheet = spec.marks.type
  if (!shelf) return [{ label: '', mark: sheet === 'automatic' ? automaticMark(r.columns.at(-1), r.rows.at(-1)) : sheet }]
  return many(r[shelf]).map((p) => {
    const own = p.pill.mark && p.pill.mark !== 'automatic' ? p.pill.mark : sheet
    const auto = () => (shelf === 'columns' ? automaticMark(p, r.rows.at(-1)) : automaticMark(r.columns.at(-1), p))
    return { label: p.label, mark: own === 'automatic' ? auto() : own }
  })
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
