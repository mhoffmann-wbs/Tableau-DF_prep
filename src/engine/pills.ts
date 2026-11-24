// Resolves a pill against the data model: which field it is, whether it is a
// dimension or an (aggregated) measure, blue or green, and its Tableau label.
// No data here, so the shelves view can use it without loading the dataset.
import { type Field, fieldOf, SOURCE_INFO, type SourceRef } from './model.ts'
import type { Aggregation, DateLevel, Pill, TableCalcType } from './spec.ts'

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
  /** Set when the pill is aggregated: a measure, or a dimension under COUNTD etc. `agg` is an aggregate calculation, labelled AGG(…). */
  agg?: Aggregation | 'agg'
  /** Date fields used as dimensions. */
  date?: { level: DateLevel; mode: 'part' | 'value' }
  kind: 'dimension' | 'measure'
  continuous: boolean
  label: string
  /** Identifies the pill's output column: same field, aggregation, date level and continuity → same column. */
  key: string
  /** Show Members in Set: the column shows this field's members (the set's dimension), only those In the set. */
  members?: string
  /** A quick table calculation over the marks (the pill shows a delta). */
  tableCalc?: Pill['tableCalc']
}

export const TABLE_CALC_NAME: Record<TableCalcType, string> = {
  runningTotal: 'Running Total',
  difference: 'Difference',
  percentDifference: 'Percent Difference',
  percentOfTotal: 'Percent of Total',
  rank: 'Rank',
  percentile: 'Percentile',
  movingAverage: 'Moving Average',
}

const NUMERIC_ONLY: Aggregation[] = ['sum', 'avg', 'median']

export function resolvePill(ref: SourceRef, pill: Pill): ResolvedPill {
  const field = fieldOf(ref, pill.field)
  const source = typeof ref === 'string' ? ref : ref.source
  if (!field) throw new EngineError(`There is no field "${pill.field}" in the ${SOURCE_INFO[source].label} data source.`)
  if (field.calc?.error) throw new EngineError(`The calculation ${field.name} has an error: ${field.calc.error.message}`)
  if (field.broken) throw new EngineError(field.broken)
  if (field.special) {
    if (pill.tableCalc) throw new EngineError(`${field.name} can’t take a table calculation: add it to a measure on Columns, Rows or the Marks card.`)
    if (pill.agg || pill.date || pill.setView) throw new EngineError(`${field.name} can’t be aggregated: each measure on the Measure Values card keeps its own aggregation.`)
    // Measure Values is a measure without an aggregation of its own, like an aggregate calc.
    const values = field.special === 'values'
    const continuous = pill.as ? pill.as === 'continuous' : values
    const key = [values ? 'agg' : '', '', field.name, continuous ? 'c' : 'd', ''].join('|')
    return { pill, field, ...(values && { agg: 'agg' as const }), kind: values ? 'measure' : 'dimension', continuous, label: field.name, key }
  }
  if (pill.setView && field.derived?.kind !== 'set') throw new EngineError(`${field.name} is not a set, so it has no members to show.`)
  if (pill.setView && pill.agg) throw new EngineError(`Show Members in Set works on the set as a dimension, not aggregated.`)
  const isDate = field.type === 'date' || field.type === 'datetime'
  const aggCalc = field.calc?.compiled?.aggregate === true
  if (aggCalc && pill.agg) throw new EngineError(`${field.name} is an aggregate calculation, so it can’t be aggregated again.`)
  const agg = aggCalc ? 'agg' : field.role === 'measure' ? (pill.agg ?? field.agg) : pill.agg
  if (agg && agg !== 'agg' && NUMERIC_ONLY.includes(agg) && field.type !== 'number')
    throw new EngineError(`${AGG_LABEL[agg]} needs a number, but ${field.name} is a ${field.type} field.`)
  if (pill.date && !isDate) throw new EngineError(`${field.name} is not a date, so it has no date parts or date values.`)
  // A date dimension without a level starts as YEAR, the way Tableau drops one on a shelf:
  // a date part, or a date value once the field is converted to continuous.
  const date = isDate && !agg ? (pill.date ?? { level: 'year' as const, mode: field.as === 'continuous' ? ('value' as const) : ('part' as const) }) : undefined

  let continuous: boolean
  if (pill.as) continuous = pill.as === 'continuous'
  else if (date) continuous = date.mode === 'value'
  else if (field.as) continuous = field.as === 'continuous'
  else if (agg) continuous = field.type === 'number' || agg === 'count' || agg === 'countd'
  else continuous = false

  const aggLabel = agg === 'agg' ? 'AGG' : agg ? AGG_LABEL[agg] : undefined
  const label = aggLabel ? `${aggLabel}(${field.name})` : date ? `${date.level.toUpperCase()}(${field.name})` : field.name
  // "You can only perform quick table calculations on measures in the view."
  if (pill.tableCalc && !agg) throw new EngineError(`A quick table calculation needs a measure: ${field.name} is a dimension here.`)
  if (pill.tableCalc && field.generated) throw new EngineError(`${field.name} is generated, so it can’t take a table calculation.`)
  const calcKey = pill.tableCalc ? `|${pill.tableCalc.type}:${pill.tableCalc.compute ?? ''}` : ''
  const key = [agg ?? '', date ? `${date.mode}:${date.level}` : '', field.name, continuous ? 'c' : 'd', pill.setView ?? ''].join('|') + calcKey
  const members = pill.setView && field.derived?.kind === 'set' ? field.derived.def.field : undefined
  return { pill, field, agg, date, kind: agg ? 'measure' : 'dimension', continuous, label, key, ...(members && { members }), ...(pill.tableCalc && { tableCalc: pill.tableCalc }) }
}
