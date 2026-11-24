// Value helpers shared by the query layer and the calc evaluator: UTC date
// parts and truncations, member display strings and the aggregations.
import type { Value } from './model.ts'
import type { Aggregation, DateLevel } from './spec.ts'

// ---- dates (UTC) ----

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_MS = 86_400_000

/** Canonical date part: YEAR 2025, QUARTER 1–4, MONTH 1–12, WEEK 1–53 (Sunday start), DAY 1–31, WEEKDAY 1–7 (Sunday = 1). */
export function datePart(ms: number, level: DateLevel): number {
  const d = new Date(ms)
  switch (level) {
    case 'year':
      return d.getUTCFullYear()
    case 'quarter':
      return Math.floor(d.getUTCMonth() / 3) + 1
    case 'month':
      return d.getUTCMonth() + 1
    case 'week': {
      const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1)
      const dayOfYear = Math.floor((ms - jan1) / DAY_MS)
      return Math.floor((dayOfYear + new Date(jan1).getUTCDay()) / 7) + 1
    }
    case 'day':
      return d.getUTCDate()
    case 'weekday':
      return d.getUTCDay() + 1
  }
}

/** Start of the date's year, quarter, month, week (Sunday) or day. */
export function dateTrunc(ms: number, level: Exclude<DateLevel, 'weekday'>): number {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  switch (level) {
    case 'year':
      return Date.UTC(y, 0, 1)
    case 'quarter':
      return Date.UTC(y, Math.floor(d.getUTCMonth() / 3) * 3, 1)
    case 'month':
      return Date.UTC(y, d.getUTCMonth(), 1)
    case 'week':
      return Date.UTC(y, d.getUTCMonth(), d.getUTCDate() - d.getUTCDay())
    case 'day':
      return Date.UTC(y, d.getUTCMonth(), d.getUTCDate())
  }
}

/** Display form of a raw value, as Tableau shows members (and as `values` filters name them). */
export function display(v: Value): string {
  if (v === null) return 'Null'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return String(v)
}

export const compareKeys = (a: number | string, b: number | string) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en')

// ---- aggregation ----

export function aggregate(values: Value[], agg: Aggregation): Value {
  const present = values.filter((v) => v !== null)
  if (agg === 'count') return present.length
  if (agg === 'countd') return new Set(present).size
  if (present.length === 0) return null
  switch (agg) {
    case 'sum':
      return (present as number[]).reduce((a, b) => a + b, 0)
    case 'avg':
      return (present as number[]).reduce((a, b) => a + b, 0) / present.length
    case 'median': {
      const s = [...(present as number[])].sort((a, b) => a - b)
      const mid = Math.floor(s.length / 2)
      return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
    }
    case 'min':
    case 'max': {
      const sorted = [...present].sort((a, b) => compareKeys(a as number | string, b as number | string))
      return agg === 'min' ? sorted[0]! : sorted[sorted.length - 1]!
    }
    case 'attr':
      return present.every((v) => v === present[0]) ? present[0]! : '*'
  }
}
