// The calc subset (PLAN.md §7b): compile a formula against the fields of a data
// source, then evaluate it per row or per group. Data-free, like pills.ts, so
// the Data pane and the shelves can show calculated fields without the dataset.
import type { Row, Value } from '../model.ts'
import { aggregate } from '../values.ts'
import { check, type FieldLookup } from './check.ts'
import { evaluate, type Scope } from './evaluate.ts'
import { type CalcType, type Node, parse } from './syntax.ts'

export { CalcError, type CalcType, type Span } from './syntax.ts'
export { MIX_MESSAGE, type FieldInfo, type FieldLookup } from './check.ts'
export { CALC_TODAY, CATEGORY_LABEL, FUNCTIONS, formatDate, type FunctionDef } from './functions.ts'

export interface CompiledCalc {
  formula: string
  ast: Node
  type: CalcType
  /** An aggregate calculation (SUM(…) / COUNT(…)) rather than a row-level one. */
  aggregate: boolean
}

/** Parses and checks a formula; throws a CalcError for the learner. */
export function compileFormula(formula: string, lookup: FieldLookup): CompiledCalc {
  const ast = parse(formula)
  check(ast, lookup, formula)
  return { formula, ast, type: ast.type!, aggregate: ast.level === 'agg' }
}

/** Resolves field values, including other calcs: row-level calcs per row, aggregate calcs per group. */
export interface CalcFields {
  /** A compiled calc by name, if the field is one. */
  calc(name: string): CompiledCalc | undefined
  /** A data field's value, when the sheet renamed or retyped fields; by default the row's own cell. */
  read?(row: Row, name: string): Value
}

export function rowValue(fields: CalcFields, row: Row, name: string): Value {
  const calc = fields.calc(name)
  if (!calc) return fields.read ? fields.read(row, name) : (row[name] ?? null)
  if (calc.aggregate) throw new Error(`${name} is an aggregate calculation`)
  return evaluate(calc.ast, { field: (n) => rowValue(fields, row, n) })
}

/** A calc's value for one row (row-level) or one group of rows (aggregate). */
export function evaluateRow(fields: CalcFields, calc: CompiledCalc, row: Row): Value {
  return evaluate(calc.ast, { field: (n) => rowValue(fields, row, n) })
}

export function evaluateGroup(fields: CalcFields, calc: CompiledCalc, rows: Row[]): Value {
  const scope: Scope = {
    field: (n) => evaluateGroup(fields, fields.calc(n)!, rows),
    aggregate: (agg, arg) => aggregate(rows.map((r) => evaluate(arg, { field: (n) => rowValue(fields, r, n) })), agg),
  }
  return evaluate(calc.ast, scope)
}
