// Runs a calculated field over the data for the calc playground (PLAN.md §7b):
// a preview of its values, and the check that compares a learner's formula
// with an exercise's reference formula. Row-level calcs are compared row by
// row over the whole source; aggregate calcs per member of the exercise's
// dimensions.
import { calcsOf, type Dataset, fieldOf, SOURCE_INFO, type Value } from '../model.ts'
import { resolvePill } from '../pills.ts'
import { columnOf, query } from '../query.ts'
import { type Calc, type SourceId, vizSpecSchema } from '../spec.ts'
import { display } from '../values.ts'
import { formatDate } from './functions.ts'
import { rowValue } from './index.ts'

export interface Sheet {
  source: SourceId
  /** Saved calcs the formula may use, then the formula itself as the last one. */
  calcs: Calc[]
}

/** How the playground shows a value: dates in ISO form, text quoted, Null as Null. */
export function showValue(v: Value, type?: string): string {
  if (v === null) return 'Null'
  if (typeof v === 'number' && (type === 'date' || type === 'datetime')) return formatDate(v, type === 'datetime')
  if (typeof v === 'string' && type === 'string') return `"${v}"`
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)))
  return display(v)
}

/** The row id field of each source, to name a row in feedback. */
const ID_FIELD: Record<SourceId, string> = { sessions: 'Session ID', subscribers: 'Subscriber ID', titles: 'Title ID' }

export interface Preview {
  /** Column headers: the fields shown, then the calc. */
  headers: string[]
  rows: string[][]
  /** How many rows (row-level) or marks (aggregate) there are in all. */
  total: number
  nulls: number
}

/** Field names a formula uses, in order of first use. */
export function fieldsUsed(formula: string): string[] {
  const names = [...formula.matchAll(/\[((?:[^\]]|\]\])+)\]/g)].map((m) => m[1]!.replace(/]]/g, ']'))
  return [...new Set(names)]
}

/**
 * The calc's values: for a row-level calc, the first `limit` rows with the
 * fields it uses; for an aggregate calc, one row per member of `by`.
 */
export function previewCalc(data: Dataset, sheet: Sheet, by: string[], limit = 12): Preview {
  const calc = sheet.calcs.at(-1)!
  const field = fieldOf(sheet, calc.name)!
  if (field.calc?.error) throw field.calc.error
  const compiled = field.calc!.compiled!
  if (compiled.aggregate) {
    const spec = vizSpecSchema.parse({ ...sheet, rows: by.map((f) => ({ field: f })), columns: [{ field: calc.name }] })
    const result = query(spec, data)
    const dims = by.map((f) => columnOf(result, spec, { field: f }))
    const value = columnOf(result, spec, { field: calc.name })
    return {
      headers: [...by, calc.name],
      rows: result.rows.map((r) => [...dims.map((d) => display(r[d.id] ?? null)), showValue(r[value.id] ?? null, compiled.type)]),
      total: result.rows.length,
      nulls: result.rows.filter((r) => r[value.id] === null).length,
    }
  }
  const calcs = calcsOf(sheet)
  const rows = data[sheet.source]
  const shown = [ID_FIELD[sheet.source], ...fieldsUsed(calc.formula).filter((f) => f !== ID_FIELD[sheet.source])].filter((f) => fieldOf(sheet, f))
  const typeOf = (name: string) => fieldOf(sheet, name)!.type
  let nulls = 0
  for (const r of rows) if (rowValue(calcs, r, calc.name) === null) nulls++
  return {
    headers: [...shown, calc.name],
    rows: rows.slice(0, limit).map((r) => [...shown.map((f) => showValue(rowValue(calcs, r, f), typeOf(f))), showValue(rowValue(calcs, r, calc.name), compiled.type)]),
    total: rows.length,
    nulls,
  }
}

export type CheckResult = { ok: true } | { ok: false; message: string }

const same = (a: Value, b: Value) =>
  a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)))

/**
 * Compares the learner's formula with the reference formula over the data.
 * Both are compiled as the calc `name` on top of the sheet's saved calcs.
 */
export function checkCalc(data: Dataset, sheet: Omit<Sheet, 'calcs'> & { calcs?: Calc[] }, formula: string, expected: string, by: string[]): CheckResult {
  const name = '__calc__'
  const mine = { source: sheet.source, calcs: [...(sheet.calcs ?? []), { name, formula }] }
  const ref = { source: sheet.source, calcs: [...(sheet.calcs ?? []), { name, formula: expected }] }
  const myField = fieldOf(mine, name)!
  const refField = fieldOf(ref, name)!
  if (myField.calc?.error) return { ok: false, message: myField.calc.error.message }
  if (refField.calc?.error) throw new Error(`reference formula ${expected}: ${refField.calc.error.message}`)
  const myCalc = myField.calc!.compiled!
  const refCalc = refField.calc!.compiled!
  if (myCalc.aggregate !== refCalc.aggregate)
    return {
      ok: false,
      message: refCalc.aggregate
        ? 'This needs an aggregate calculation: aggregate first (SUM, AVG, COUNT…), then combine the results.'
        : 'This needs a row-level calculation, computed for each row: leave out aggregations such as SUM.',
    }
  const t = (type: string) => ({ number: 'a number', string: 'a string', boolean: 'TRUE/FALSE', date: 'a date', datetime: 'a date and time' })[type] ?? type
  const dateish = (x: string) => x === 'date' || x === 'datetime'
  if (myField.type !== refField.type && !(dateish(myField.type) && dateish(refField.type)))
    return { ok: false, message: `Your calculation returns ${t(myField.type)}; the answer returns ${t(refField.type)}.` }

  if (refCalc.aggregate) {
    const spec = (s: Sheet) => vizSpecSchema.parse({ ...s, rows: by.map((f) => ({ field: f })), columns: [{ field: name }] })
    const run = (s: Sheet) => {
      const v = spec(s)
      const result = query(v, data)
      const dims = by.map((f) => columnOf(result, v, { field: f }))
      const value = columnOf(result, v, { field: name })
      return new Map(result.rows.map((r) => [dims.map((d) => `${resolvePill(v, d.pill).field.name} = ${display(r[d.id] ?? null)}`).join(', ') || 'the whole data source', r[value.id] ?? null]))
    }
    const got = run(mine)
    for (const [where, want] of run(ref)) {
      const have = got.get(where) ?? null
      if (!same(have, want)) return { ok: false, message: `For ${where}, your calculation gives ${showValue(have, myField.type)}; it should give ${showValue(want, refField.type)}.` }
    }
    return { ok: true }
  }

  const myCalcs = calcsOf(mine)
  const refCalcs = calcsOf(ref)
  let first: string | undefined
  let wrong = 0
  const rows = data[sheet.source]
  for (const r of rows) {
    const have = rowValue(myCalcs, r, name)
    const want = rowValue(refCalcs, r, name)
    if (same(have, want)) continue
    wrong++
    first ??= `For ${ID_FIELD[sheet.source]} ${display(r[ID_FIELD[sheet.source]] ?? null)}, your calculation gives ${showValue(have, myField.type)}; it should give ${showValue(want, refField.type)}.`
  }
  if (first) return { ok: false, message: `${first} ${wrong.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} ${SOURCE_INFO[sheet.source].label.toLowerCase()} rows differ.` }
  return { ok: true }
}
