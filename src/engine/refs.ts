// Reference lines, bands and distributions (PLAN.md §7a, lesson 2.3): the
// values they sit at, computed over the marks in their scope (one table, each
// pane or each cell). Total aggregates the underlying rows instead, "the same
// as selecting one of the totals option[s]". Where the help gives no default
// or formula, the choice is marked here and listed in PLAN.md §10.
import type { Value } from './model.ts'
import type { NumberFormat, Ref, RefAgg, RefValue } from './spec.ts'
import { formatNumber } from './values.ts'

export const REF_AGG_NAME: Record<RefAgg, string> = { total: 'Total', sum: 'Sum', min: 'Minimum', max: 'Maximum', avg: 'Average', median: 'Median' }

/** One value a reference item marks: a line (`stroke`), or an edge of a band with only its label. */
export interface RefLine {
  value: number
  label?: string
  stroke: boolean
}

/** A reference item in one scope: its lines and the shaded range between them, if any. */
export interface RefValues {
  lines: RefLine[]
  band?: [number, number]
}

/** "Tableau uses estimation type 7 in the R standard to compute quantiles and percentiles." */
export function quantile(sorted: number[], p: number): number {
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  return lo + 1 < sorted.length ? sorted[lo]! + (h - lo) * (sorted[lo + 1]! - sorted[lo]!) : sorted[lo]!
}

function computed(agg: RefAgg, xs: number[], total: () => Value): number | null {
  if (agg === 'total') return typeof total() === 'number' ? (total() as number) : null
  if (xs.length === 0) return null
  const sum = xs.reduce((a, b) => a + b, 0)
  switch (agg) {
    case 'sum':
      return sum
    case 'avg':
      return sum / xs.length
    case 'min':
      return Math.min(...xs)
    case 'max':
      return Math.max(...xs)
    case 'median':
      return quantile(
        [...xs].sort((a, b) => a - b),
        0.5,
      )
  }
}

/**
 * The values of a reference item over the marks in one scope. `total` gives
 * the measure's Total over those marks' rows. Computation labels name the
 * computation and the measure (the help: "the name of the field … and any
 * computation"); their wording, and Standard Deviation's mean, are ours.
 */
export function refValues(ref: Ref, values: Value[], total: () => Value, measure: { label: string; format?: NumberFormat }): RefValues {
  const xs = values.filter((v): v is number => typeof v === 'number')
  const text = (v: number) => (measure.format ? formatNumber(v, measure.format) : v.toLocaleString('en', { maximumFractionDigits: 2 }))
  const label = (v: number, computation: string) => {
    switch (ref.label) {
      case 'none':
        return undefined
      case 'value':
        return text(v)
      case 'computation':
        return computation
      case 'custom':
        return (ref.custom ?? '').replaceAll('<Value>', text(v))
    }
  }
  const at = (rv: RefValue) => (rv.kind === 'constant' ? rv.value : computed(rv.agg, xs, total))
  const nameOf = (rv: RefValue) => (rv.kind === 'constant' ? 'Constant' : `${REF_AGG_NAME[rv.agg]} of ${measure.label}`)

  if (ref.kind === 'line') {
    const v = at(ref.value)
    return v === null ? { lines: [] } : { lines: [{ value: v, label: label(v, nameOf(ref.value)), stroke: true }] }
  }
  if (ref.kind === 'band') {
    const from = at(ref.from)
    const to = at(ref.to)
    if (from === null || to === null) return { lines: [] }
    return {
      lines: [
        { value: from, label: label(from, nameOf(ref.from)), stroke: false },
        { value: to, label: label(to, nameOf(ref.to)), stroke: false },
      ],
      band: [Math.min(from, to), Math.max(from, to)],
    }
  }
  const sorted = [...xs].sort((a, b) => a - b)
  let marks: [number, string][] = []
  const d = ref.dist
  if (d.kind === 'percentages') {
    const base = computed(d.agg, xs, total)
    if (base !== null) marks = d.values.map((p) => [(base * p) / 100, `${p}% of ${REF_AGG_NAME[d.agg]}`])
  } else if (sorted.length === 0) {
    marks = []
  } else if (d.kind === 'percentiles') {
    marks = d.values.map((p) => [quantile(sorted, p / 100), `Percentile ${p}`])
  } else if (d.kind === 'quantiles') {
    marks = Array.from({ length: d.n - 1 }, (_, i): [number, string] => [quantile(sorted, (i + 1) / d.n), `Quantile ${i + 1} of ${d.n}`])
  } else if (sorted.length > (d.sample ? 1 : 0)) {
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
    const sd = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (sorted.length - (d.sample ? 1 : 0)))
    marks = [
      [mean - d.factor * sd, `−${d.factor} SD`],
      [mean + d.factor * sd, `+${d.factor} SD`],
    ]
  }
  if (marks.length === 0) return { lines: [] }
  const vs = marks.map(([v]) => v)
  return { lines: marks.map(([v, c]) => ({ value: v, label: label(v, c), stroke: true })), band: [Math.min(...vs), Math.max(...vs)] }
}
