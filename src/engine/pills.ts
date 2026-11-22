// Resolves a pill against the data model: which field it is, whether it is a
// dimension or an (aggregated) measure, blue or green, and its Tableau label.
// No data here, so the shelves view can use it without loading the dataset.
import { type Field, fieldOf, SOURCE_INFO } from './model.ts'
import type { Aggregation, DateLevel, Pill, SourceId } from './spec.ts'

/** A problem with a spec, phrased for the learner. */
export class EngineError extends Error {}

export const AGG_LABEL: Record<Aggregation, string> = {
  sum: 'SUM',
  avg: 'AVG',
  median: 'MEDIAN',
  count: 'CNT',
  countd: 'CNTD',
  min: 'MIN',
  max: 'MAX',
  attr: 'ATTR',
}

export interface ResolvedPill {
  pill: Pill
  field: Field
  /** Set when the pill is aggregated: a measure, or a dimension under COUNTD etc. */
  agg?: Aggregation
  /** Date fields used as dimensions. */
  date?: { level: DateLevel; mode: 'part' | 'value' }
  kind: 'dimension' | 'measure'
  continuous: boolean
  label: string
  /** Identifies the pill's output column: same field, aggregation, date level and continuity → same column. */
  key: string
}

const NUMERIC_ONLY: Aggregation[] = ['sum', 'avg', 'median']

export function resolvePill(source: SourceId, pill: Pill): ResolvedPill {
  const field = fieldOf(source, pill.field)
  if (!field) throw new EngineError(`There is no field "${pill.field}" in the ${SOURCE_INFO[source].label} data source.`)
  const isDate = field.type === 'date' || field.type === 'datetime'
  const agg = field.role === 'measure' ? (pill.agg ?? field.agg) : pill.agg
  if (agg && NUMERIC_ONLY.includes(agg) && field.type !== 'number')
    throw new EngineError(`${AGG_LABEL[agg]} needs a number, but ${field.name} is a ${field.type} field.`)
  if (pill.date && !isDate) throw new EngineError(`${field.name} is not a date, so it has no date parts or date values.`)
  // A date dimension without a level starts as YEAR, the way Tableau drops one on a shelf.
  const date = isDate && !agg ? (pill.date ?? { level: 'year' as const, mode: 'part' as const }) : undefined

  let continuous: boolean
  if (pill.as) continuous = pill.as === 'continuous'
  else if (date) continuous = date.mode === 'value'
  else if (agg) continuous = field.type === 'number' || agg === 'count' || agg === 'countd'
  else continuous = false

  const label = agg ? `${AGG_LABEL[agg]}(${field.name})` : date ? `${date.level.toUpperCase()}(${field.name})` : field.name
  const key = [agg ?? '', date ? `${date.mode}:${date.level}` : '', field.name, continuous ? 'c' : 'd'].join('|')
  return { pill, field, agg, date, kind: agg ? 'measure' : 'dimension', continuous, label, key }
}
