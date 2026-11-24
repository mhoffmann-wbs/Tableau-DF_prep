// Recomputes the data facts that lessons (and later challenge checkpoints)
// state, so no number about the Driftlight data is typed by hand. Tests compare
// each fact's `says` with `evaluateFact`.
import type { Dataset } from '../engine/model.ts'
import { columnOf, query } from '../engine/query.ts'
import type { Fact } from './schema.ts'

/** The text a fact should show, computed from the data. Throws when the fact doesn't pick exactly one row. */
export function evaluateFact(fact: Fact, data: Dataset): string {
  const result = query(fact.spec, data)
  const measure = columnOf(result, fact.spec, fact.measure)
  if (fact.kind === 'top') {
    const dimension = columnOf(result, fact.spec, fact.dimension)
    const sign = fact.order === 'desc' ? -1 : 1
    const values = result.rows.map((r) => r[measure.id] as number)
    const best = sign * Math.min(...values.map((v) => sign * v))
    const winners = result.rows.filter((r) => r[measure.id] === best)
    if (winners.length !== 1) throw new Error(`"${fact.says}": ${winners.length} members tie for the top`)
    return String(winners[0]![dimension.id])
  }
  const rows = result.rows.filter((r) =>
    Object.entries(fact.where ?? {}).every(([field, member]) => {
      const column = result.columns.find((c) => c.field.name === field && !c.continuous)
      if (!column) throw new Error(`"${fact.says}": ${field} is not a discrete field in the view`)
      return r[column.id] === member
    }),
  )
  if (rows.length !== 1) throw new Error(`"${fact.says}": picks ${rows.length} rows, expected 1`)
  const value = rows[0]![measure.id] as number
  const n = fact.percent ? value * 100 : value
  const text = n.toLocaleString('en-US', { minimumFractionDigits: fact.digits, maximumFractionDigits: fact.digits })
  return fact.percent ? `${text}%` : text
}
