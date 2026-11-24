// Evaluates a checked formula. One evaluator serves both levels: a row scope
// reads fields from one row, a group scope reads aggregate calcs and runs the
// aggregations over the group's rows. Null rules from the help: arithmetic and
// comparisons with Null give Null, an IF or CASE treats a null test like FALSE,
// IIF returns its optional unknown argument, and dividing by zero gives Null
// (Tableau knowledge article 001474028).
import type { Value } from '../model.ts'
import type { Aggregation } from '../spec.ts'
import { DAY_MS } from '../values.ts'
import { FUNCTION_BY_NAME, isAggregateCall, parseDateText } from './functions.ts'
import type { Node } from './syntax.ts'

export interface Scope {
  field(name: string): Value
  /** Group scopes only: aggregates a row-level argument over the group. */
  aggregate?(agg: Aggregation, arg: Node): Value
}

const isDate = (n: Node) => n.type === 'date' || n.type === 'datetime'

function compare(a: Value, b: Value): number {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  return Number(a) - Number(b)
}

export function evaluate(node: Node, scope: Scope): Value {
  const ev = (n: Node) => evaluate(n, scope)
  switch (node.k) {
    case 'num':
    case 'str':
    case 'bool':
      return node.v
    case 'null':
      return null
    case 'date':
      return parseDateText(node.text)!.ms
    case 'field':
      return scope.field(node.name)
    case 'name':
      return node.name.toLowerCase()
    case 'unary': {
      const v = ev(node.arg)
      if (v === null) return null
      return node.op === '-' ? -(v as number) : !v
    }
    case 'binary':
      return binary(node, ev)
    case 'call': {
      const fn = FUNCTION_BY_NAME.get(node.name)!
      if (isAggregateCall(fn, node.args.length)) {
        if (!scope.aggregate) throw new Error(`${fn.name} needs a group of rows`)
        return scope.aggregate(fn.agg!, node.args[0]!)
      }
      if (fn.name === 'IIF') {
        const test = ev(node.args[0]!)
        if (test === true) return ev(node.args[1]!)
        if (test === false) return ev(node.args[2]!)
        return node.args[3] ? ev(node.args[3]) : null
      }
      const values = node.args.map(ev)
      if (!fn.nullSafe && values.some((v) => v === null)) return null
      return fn.run!(
        values,
        node.args.map((a) => a.type!),
      )
    }
    case 'if': {
      for (const b of node.branches) if (ev(b.cond) === true) return ev(b.then)
      return node.else ? ev(node.else) : null
    }
    case 'case': {
      const subject = ev(node.subject)
      if (subject !== null)
        for (const w of node.whens) {
          const v = ev(w.value)
          if (v !== null && compare(subject, v) === 0) return ev(w.then)
        }
      return node.else ? ev(node.else) : null
    }
  }
}

function binary(node: Extract<Node, { k: 'binary' }>, ev: (n: Node) => Value): Value {
  // AND and OR skip the right side once the left decides, as the help says.
  if (node.op === 'AND') {
    const l = ev(node.left)
    if (l === false) return false
    const r = ev(node.right)
    if (r === false) return false
    return l === null || r === null ? null : true
  }
  if (node.op === 'OR') {
    const l = ev(node.left)
    if (l === true) return true
    const r = ev(node.right)
    if (r === true) return true
    return l === null || r === null ? null : false
  }
  const l = ev(node.left)
  const r = ev(node.right)
  if (l === null || r === null) return null
  switch (node.op) {
    case '=':
    case '==':
      return compare(l, r) === 0
    case '!=':
    case '<>':
      return compare(l, r) !== 0
    case '<':
      return compare(l, r) < 0
    case '<=':
      return compare(l, r) <= 0
    case '>':
      return compare(l, r) > 0
    case '>=':
      return compare(l, r) >= 0
    case '+':
      if (typeof l === 'string') return l + (r as string)
      // A number added to a date counts days.
      if (isDate(node.left)) return (l as number) + (r as number) * DAY_MS
      if (isDate(node.right)) return (r as number) + (l as number) * DAY_MS
      return (l as number) + (r as number)
    case '-':
      if (isDate(node.left) && isDate(node.right)) return ((l as number) - (r as number)) / DAY_MS
      if (isDate(node.left)) return (l as number) - (r as number) * DAY_MS
      return (l as number) - (r as number)
    case '*':
      return (l as number) * (r as number)
    case '/':
      return r === 0 ? null : (l as number) / (r as number)
    case '%':
      return r === 0 ? null : (l as number) % (r as number)
    case '^':
      return (l as number) ** (r as number)
  }
  throw new Error(`unknown operator ${node.op}`)
}
