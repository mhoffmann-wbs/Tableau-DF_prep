// Quick table calculations (PLAN.md §7a): computed over the marks after
// aggregation, like a window function. Compute Using decides which of the
// view's dimensions the calculation runs along (addressing) and in what
// order; the others split the marks into partitions, where it restarts.
// Definitions from the help ("Table Calculation Types"); where it gives no
// formula or default, the choice is marked here and listed in PLAN.md §10.
import type { Value } from './model.ts'
import type { ComputeUsing, NumberFormat, TableCalcType } from './spec.ts'

export const COMPUTE_USING_NAME: Record<ComputeUsing, string> = {
  tableAcross: 'Table (across)',
  tableDown: 'Table (down)',
  tableAcrossDown: 'Table (across then down)',
  tableDownAcross: 'Table (down then across)',
  paneDown: 'Pane (down)',
  paneAcrossDown: 'Pane (across then down)',
  paneDownAcross: 'Pane (down then across)',
  cell: 'Cell',
}

/** Results that are shares or rates show as percentages, like the help's "19.11%". */
export const PERCENT_CALCS: TableCalcType[] = ['percentDifference', 'percentOfTotal', 'percentile']
export const PERCENT_FORMAT: NumberFormat = { kind: 'percent', decimals: 2, units: '', separators: true, prefix: '', suffix: '' }

/**
 * Compute Using when the pill doesn't set one. The help only says quick table
 * calculations use "the most typical settings"; we go across the table, or
 * down it when nothing is across (unverified).
 */
export function defaultCompute(hasAcross: boolean): ComputeUsing {
  return hasAcross ? 'tableAcross' : 'tableDown'
}

/**
 * The dimensions a calculation addresses, in the order it walks them (the
 * first varies slowest). `across` and `down` are the dimensions on Columns
 * and Rows, outer to inner; the innermost of each is the one inside a pane.
 */
export function addressing<D>(compute: ComputeUsing, across: D[], down: D[]): D[] {
  const a = across.slice(-1)
  const d = down.slice(-1)
  switch (compute) {
    case 'tableAcross':
      return across
    case 'tableDown':
      return down
    // Across then down: along a row first, then the next row down.
    case 'tableAcrossDown':
      return [...down, ...across]
    case 'tableDownAcross':
      return [...across, ...down]
    case 'paneDown':
      return d
    case 'paneAcrossDown':
      return [...d, ...a]
    case 'paneDownAcross':
      return [...a, ...d]
    case 'cell':
      return []
  }
}

const num = (v: Value): number | null => (typeof v === 'number' ? v : null)

/**
 * One partition's results, from its values in addressing order. Formulas the
 * help doesn't give (unverified): Percent Difference divides by the absolute
 * previous value; Rank is Competition (1, 2, 2, 4), and its order Descending
 * is the help's default; Percentile is (values below) / (n − 1), so the lowest
 * is 0% and the highest 100% as in the help's example, and a lone value 100%;
 * Moving Average averages the two previous values and the current one, as in
 * the help's example, over the values that exist at the start. Nulls are skipped.
 */
export function tableCalcValues(type: TableCalcType, values: Value[]): Value[] {
  const xs = values.map(num)
  const present = xs.filter((x): x is number => x !== null)
  switch (type) {
    case 'runningTotal': {
      let sum: number | null = null
      return xs.map((x) => {
        if (x !== null) sum = (sum ?? 0) + x
        return sum
      })
    }
    case 'difference':
      return xs.map((x, i) => (i > 0 && x !== null && xs[i - 1] != null ? x - xs[i - 1]! : null))
    case 'percentDifference':
      return xs.map((x, i) => {
        const prev = i > 0 ? xs[i - 1] : null
        return x !== null && prev != null && prev !== 0 ? (x - prev) / Math.abs(prev) : null
      })
    case 'percentOfTotal': {
      const total = present.reduce((s, x) => s + x, 0)
      return xs.map((x) => (x !== null && total !== 0 ? x / total : null))
    }
    case 'rank':
      return xs.map((x) => (x === null ? null : 1 + present.filter((y) => y > x).length))
    case 'percentile':
      return xs.map((x) => (x === null ? null : present.length === 1 ? 1 : present.filter((y) => y < x).length / (present.length - 1)))
    case 'movingAverage':
      return xs.map((_, i) => {
        const window = xs.slice(Math.max(0, i - 2), i + 1).filter((y): y is number => y !== null)
        return window.length ? window.reduce((s, y) => s + y, 0) / window.length : null
      })
  }
}
