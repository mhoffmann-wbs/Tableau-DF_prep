// Type and aggregation checks for a parsed formula. Each node gets its result
// type and its level: row-level, aggregate, or a constant that fits either.
// The aggregation rule comes from "Aggregate Functions in Tableau": "the
// arguments to any given function must either all be aggregated or all
// disaggregated", and `[Sales] - AVG([Sales])` fails with the message below
// (help.tableau.com …/calculations_calculatedfields_lod_overview.htm).
import { WEEKDAYS } from '../values.ts'
import { DATE_PARTS, FUNCTION_BY_NAME, isAggregateCall, parseDateText, typeName, unify } from './functions.ts'
import { CalcError, type CalcType, type Level, type Node, type Span } from './syntax.ts'

export const MIX_MESSAGE = 'Cannot mix aggregate and non-aggregate arguments with this function.'

export interface FieldInfo {
  type: CalcType
  /** An aggregate calculation used as a field is aggregate itself. */
  level: 'row' | 'agg'
}

/** Looks a field up by name: its info, or a message saying why it can't be used. */
export type FieldLookup = (name: string) => FieldInfo | string

const COMPARISON = ['=', '==', '!=', '<>', '<', '<=', '>', '>=']

export function check(root: Node, lookup: FieldLookup, src: string): void {
  const text = (span: Span) => src.slice(span.start, span.end).trim()
  const shorten = (s: string) => (s.length > 40 ? `${s.slice(0, 37)}…` : s)
  const typeError = (span: Span, message: string) => new CalcError('type', message, span)

  /** The level of several parts that meet in one function, operator or IF; mixing row-level and aggregate is the error. */
  function combine(parts: Node[]): Level {
    const row = parts.find((n) => n.level === 'row')
    const agg = parts.find((n) => n.level === 'agg')
    if (row && agg)
      throw new CalcError(
        'mix',
        MIX_MESSAGE,
        row.span,
        `${shorten(text(row.span))} is computed for every row, but ${shorten(text(agg.span))} is aggregated. Aggregate the row-level part too (for example with SUM or AVG), or make the whole formula row-level.`,
      )
    return agg ? 'agg' : row ? 'row' : 'const'
  }

  function datePartArg(node: Node, fn: string, allowed: readonly string[]): void {
    const raw = node.k === 'str' ? node.v : node.k === 'name' ? node.name : undefined
    if (raw === undefined) throw typeError(node.span, `${fn} needs a date part written as text, such as 'month'.`)
    const part = raw.toLowerCase()
    if (part.startsWith('iso-')) throw typeError(node.span, `ISO date parts such as '${part}' aren’t part of this playground.`)
    if (!(DATE_PARTS as readonly string[]).includes(part)) throw typeError(node.span, `'${raw}' isn’t a date part. Use one of: ${DATE_PARTS.map((p) => `'${p}'`).join(', ')}.`)
    if (!allowed.includes(part)) throw typeError(node.span, `${fn} can’t use '${part}'.`)
    node.type = 'string'
    node.level = 'const'
  }

  function weekStartArg(node: Node, fn: string): void {
    if (node.k !== 'str' || !WEEKDAYS.some((d) => d.toLowerCase() === node.v.toLowerCase()))
      throw typeError(node.span, `${fn}’s last argument is the start of the week, written as text such as 'monday'.`)
    node.type = 'string'
    node.level = 'const'
  }

  function visit(node: Node): void {
    switch (node.k) {
      case 'num':
        node.type = 'number'
        node.level = 'const'
        return
      case 'str':
        node.type = 'string'
        node.level = 'const'
        return
      case 'bool':
        node.type = 'boolean'
        node.level = 'const'
        return
      case 'null':
        node.type = 'null'
        node.level = 'const'
        return
      case 'date': {
        const d = parseDateText(node.text)
        if (!d) throw typeError(node.span, `#${node.text}# isn’t a date Tableau can read here. Write it like #2024-03-25#.`)
        node.type = d.time ? 'datetime' : 'date'
        node.level = 'const'
        return
      }
      case 'field': {
        const info = lookup(node.name)
        if (typeof info === 'string') throw new CalcError('field', info, node.span)
        node.type = info.type
        node.level = info.level
        return
      }
      case 'name':
        throw new CalcError('field', `${node.name} isn’t a function or a field. Field names go in square brackets: [${node.name}].`, node.span)
      case 'unary': {
        visit(node.arg)
        const want = node.op === '-' ? 'number' : 'boolean'
        if (node.arg.type !== want && node.arg.type !== 'null') throw typeError(node.span, `${node.op} needs ${typeName(want)}, but ${shorten(text(node.arg.span))} is ${typeName(node.arg.type!)}.`)
        node.type = want
        node.level = node.arg.level
        return
      }
      case 'binary':
        return binary(node)
      case 'call':
        return call(node)
      case 'if': {
        const results: Node[] = []
        for (const b of node.branches) {
          visit(b.cond)
          if (b.cond.type !== 'boolean' && b.cond.type !== 'null') throw typeError(b.cond.span, `An IF condition must be TRUE or FALSE, but ${shorten(text(b.cond.span))} is ${typeName(b.cond.type!)}.`)
          visit(b.then)
          results.push(b.then)
        }
        if (node.else) {
          visit(node.else)
          results.push(node.else)
        }
        node.type = sameType(results, 'IF')
        node.level = combine([...node.branches.map((b) => b.cond), ...results])
        return
      }
      case 'case': {
        visit(node.subject)
        const results: Node[] = []
        for (const w of node.whens) {
          visit(w.value)
          if (!unify(node.subject.type!, w.value.type!)) throw typeError(w.value.span, `CASE compares ${typeName(node.subject.type!)} with ${typeName(w.value.type!)}: the WHEN values must have the CASE expression’s type.`)
          visit(w.then)
          results.push(w.then)
        }
        if (node.else) {
          visit(node.else)
          results.push(node.else)
        }
        node.type = sameType(results, 'CASE')
        node.level = combine([node.subject, ...node.whens.map((w) => w.value), ...results])
        return
      }
    }
  }

  function sameType(results: Node[], what: string): CalcType {
    let t: CalcType = 'null'
    for (const r of results) {
      const u = unify(t, r.type!)
      if (!u) throw typeError(r.span, `This ${what} returns ${typeName(t)} in one place and ${typeName(r.type!)} in another: every result must have the same type.`)
      t = u
    }
    return t
  }

  function binary(node: Extract<Node, { k: 'binary' }>): void {
    visit(node.left)
    visit(node.right)
    const [l, r] = [node.left.type!, node.right.type!]
    const isDate = (t: CalcType) => t === 'date' || t === 'datetime'
    const bad = () =>
      typeError(node.span, `${node.op} can’t combine ${typeName(l)} (${shorten(text(node.left.span))}) with ${typeName(r)} (${shorten(text(node.right.span))}).`)
    node.level = combine([node.left, node.right])
    if (node.op === 'AND' || node.op === 'OR') {
      if (!['boolean', 'null'].includes(l) || !['boolean', 'null'].includes(r)) throw bad()
      node.type = 'boolean'
    } else if (COMPARISON.includes(node.op)) {
      if (!unify(l, r)) throw bad()
      node.type = 'boolean'
    } else if (node.op === '+') {
      if (l === 'null' || r === 'null') node.type = l === 'null' ? (r === 'null' ? 'null' : r) : l
      else if (l === 'number' && r === 'number') node.type = 'number'
      else if (l === 'string' && r === 'string') node.type = 'string'
      else if (isDate(l) && r === 'number') node.type = l
      else if (l === 'number' && isDate(r)) node.type = r
      else if (l === 'string' || r === 'string') throw typeError(node.span, `+ joins two strings, but one side is ${typeName(l === 'string' ? r : l)}. Convert it with STR() first.`)
      else throw bad()
    } else if (node.op === '-') {
      if (l === 'null' || r === 'null') node.type = isDate(l) && isDate(r) ? 'number' : l === 'null' ? r : l
      else if (l === 'number' && r === 'number') node.type = 'number'
      else if (isDate(l) && r === 'number') node.type = l
      else if (isDate(l) && isDate(r)) node.type = 'number'
      else throw bad()
    } else {
      if (!['number', 'null'].includes(l) || !['number', 'null'].includes(r)) throw bad()
      node.type = 'number'
    }
  }

  function call(node: Extract<Node, { k: 'call' }>): void {
    const fn = FUNCTION_BY_NAME.get(node.name)
    if (!fn) throw new CalcError('field', `${node.name} isn’t one of the functions this playground knows. Check the spelling, or pick one from the function list.`, node.nameSpan)
    const n = node.args.length
    if (n < fn.min || n > fn.max) {
      const count = fn.min === fn.max ? `${fn.min}` : `${fn.min} to ${fn.max}`
      throw typeError(node.span, `${fn.name} takes ${count} argument${fn.max === 1 ? '' : 's'}, but it has ${n}. The form is ${fn.syntax}.`)
    }
    const rest = fn.datePart ? node.args.slice(1) : node.args
    if (fn.datePart) {
      const allowed = fn.name === 'DATETRUNC' || fn.name === 'DATEADD' || fn.name === 'DATEDIFF' ? DATE_PARTS.filter((p) => p !== 'weekday' && p !== 'dayofyear') : DATE_PARTS
      datePartArg(node.args[0]!, fn.name, allowed)
      const weekArg = fn.name === 'DATEDIFF' ? 3 : fn.name === 'DATEADD' ? undefined : 2
      if (weekArg !== undefined && node.args[weekArg]) weekStartArg(node.args[weekArg]!, fn.name)
    }
    for (const a of rest) if (a.type === undefined) visit(a)
    const t = fn.type(node.args.map((a) => a.type!))
    if (!['number', 'string', 'boolean', 'date', 'datetime', 'null'].includes(t)) throw typeError(node.span, t)
    node.type = t as CalcType
    if (isAggregateCall(fn, n)) {
      const arg = node.args[0]!
      if (arg.level === 'agg')
        throw new CalcError('mix', `${fn.name} can’t aggregate ${shorten(text(arg.span))}: it is already aggregated.`, arg.span, 'Aggregate row-level values once. To combine aggregates, use operators between them, for example SUM([A]) / COUNT([B]).')
      node.level = 'agg'
    } else node.level = combine(node.args)
  }

  visit(root)
}
