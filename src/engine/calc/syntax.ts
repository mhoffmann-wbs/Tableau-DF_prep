// Tokenizer and parser for the calc subset (PLAN.md §7b). Operator precedence
// follows Tableau's table in "Writing Calculations in Tableau"
// (help.tableau.com …/functions_operators.htm), from first to last:
// negate, ^, * / %, + -, comparisons, NOT, AND, OR; equal precedence runs left
// to right. Keywords and function names are case-insensitive.

export interface Span {
  start: number
  end: number
}

export type ErrorKind = 'syntax' | 'field' | 'type' | 'mix'

/** A problem with a formula, phrased for the learner, with where it is in the formula. */
export class CalcError extends Error {
  readonly kind: ErrorKind
  readonly span?: Span
  /** A longer explanation shown under the message. */
  readonly explain?: string
  constructor(kind: ErrorKind, message: string, span?: Span, explain?: string) {
    super(message)
    this.kind = kind
    this.span = span
    this.explain = explain
  }
}

// ---- tokens ----

type Token =
  | { t: 'num'; v: number; span: Span }
  | { t: 'str'; v: string; span: Span }
  | { t: 'date'; v: string; span: Span }
  | { t: 'field'; v: string; span: Span }
  | { t: 'id'; v: string; span: Span }
  | { t: 'op'; v: string; span: Span }
  | { t: 'eof'; span: Span }

const OPS2 = ['==', '!=', '<>', '<=', '>=']
const OPS1 = '+-*/%^=<>(),'

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    const start = i
    if (/\s/.test(ch)) {
      i++
    } else if (src.startsWith('//', i)) {
      while (i < src.length && src[i] !== '\n') i++
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      if (end < 0) throw new CalcError('syntax', 'This comment has no closing */.', { start, end: src.length })
      i = end + 2
    } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d*\.?\d+|\d+\.)([eE][+-]?\d+)?/.exec(src.slice(i))!
      i += m[0].length
      out.push({ t: 'num', v: Number(m[0]), span: { start, end: i } })
    } else if (ch === "'" || ch === '"') {
      // A quote inside a string is written twice: 'O''Hanrahan'.
      let v = ''
      i++
      for (;;) {
        if (i >= src.length) throw new CalcError('syntax', `This text has no closing ${ch}.`, { start, end: src.length })
        if (src[i] === ch && src[i + 1] === ch) {
          v += ch
          i += 2
        } else if (src[i] === ch) {
          i++
          break
        } else v += src[i++]
      }
      out.push({ t: 'str', v, span: { start, end: i } })
    } else if (ch === '#') {
      const end = src.indexOf('#', i + 1)
      if (end < 0) throw new CalcError('syntax', 'This date has no closing #.', { start, end: src.length })
      i = end + 1
      out.push({ t: 'date', v: src.slice(start + 1, end).trim(), span: { start, end: i } })
    } else if (ch === '[') {
      // A ] inside a field name is written twice.
      let v = ''
      i++
      for (;;) {
        if (i >= src.length) throw new CalcError('syntax', 'This field name has no closing ].', { start, end: src.length })
        if (src[i] === ']' && src[i + 1] === ']') {
          v += ']'
          i += 2
        } else if (src[i] === ']') {
          i++
          break
        } else v += src[i++]
      }
      out.push({ t: 'field', v, span: { start, end: i } })
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      i += m[0].length
      out.push({ t: 'id', v: m[0], span: { start, end: i } })
    } else {
      const two = src.slice(i, i + 2)
      if (OPS2.includes(two)) {
        i += 2
        out.push({ t: 'op', v: two, span: { start, end: i } })
      } else if (OPS1.includes(ch)) {
        i++
        out.push({ t: 'op', v: ch, span: { start, end: i } })
      } else if (ch === ';') {
        throw new CalcError('syntax', 'A calculation is one expression, with no ; at the end.', { start, end: i + 1 })
      } else {
        throw new CalcError('syntax', `The character ${ch} can’t be used here.`, { start, end: i + 1 })
      }
    }
  }
  out.push({ t: 'eof', span: { start: src.length, end: src.length } })
  return out
}

// ---- syntax tree ----

/** Set on every node by the checker. */
export type CalcType = 'number' | 'string' | 'boolean' | 'date' | 'datetime' | 'null'
/** Row-level, aggregate, or a constant that fits either. */
export type Level = 'row' | 'agg' | 'const'

interface Base {
  span: Span
  type?: CalcType
  level?: Level
}

export type Node = Base &
  (
    | { k: 'num'; v: number }
    | { k: 'str'; v: string }
    | { k: 'bool'; v: boolean }
    | { k: 'null' }
    | { k: 'date'; text: string }
    | { k: 'field'; name: string }
    /** A bare word: only valid as a date part, as in DATETRUNC(quarter, …). */
    | { k: 'name'; name: string }
    | { k: 'unary'; op: '-' | 'NOT'; arg: Node }
    | { k: 'binary'; op: string; left: Node; right: Node }
    | { k: 'call'; name: string; args: Node[]; nameSpan: Span }
    | { k: 'if'; branches: { cond: Node; then: Node }[]; else?: Node }
    | { k: 'case'; subject: Node; whens: { value: Node; then: Node }[]; else?: Node }
  )

const KEYWORDS = ['IF', 'THEN', 'ELSEIF', 'ELSE', 'END', 'CASE', 'WHEN', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'NULL']
const COMPARISONS = ['=', '==', '!=', '<>', '<', '<=', '>', '>=']

const describe = (tok: Token) =>
  tok.t === 'eof' ? 'the end of the formula' : tok.t === 'op' ? tok.v : tok.t === 'field' ? `[${tok.v}]` : tok.t === 'id' ? tok.v.toUpperCase() : 'a value'

export function parse(src: string): Node {
  const tokens = tokenize(src)
  if (tokens.length === 1) throw new CalcError('syntax', 'The formula is empty.', { start: 0, end: 0 })
  let pos = 0
  const peek = () => tokens[pos]!
  const next = () => tokens[pos++]!
  const isKw = (tok: Token, kw: string) => tok.t === 'id' && tok.v.toUpperCase() === kw
  const isOp = (tok: Token, op: string) => tok.t === 'op' && tok.v === op
  const span = (a: Span, b: Span): Span => ({ start: a.start, end: b.end })

  function expectKw(kw: string, opener: Span, what: string): Token {
    const tok = peek()
    if (!isKw(tok, kw)) throw new CalcError('syntax', `Expected ${kw} ${what}, found ${describe(tok)}.`, opener.start === tok.span.start ? tok.span : span(opener, tok.span))
    return next()
  }

  function expectOp(op: string, opener: Span): Token {
    const tok = peek()
    if (!isOp(tok, op)) {
      const msg = op === ')' ? `Expected ) to close the ( here, found ${describe(tok)}.` : `Expected ${op}, found ${describe(tok)}.`
      throw new CalcError('syntax', msg, span(opener, tok.span))
    }
    return next()
  }

  // Precedence climbing, loosest first.
  function or(): Node {
    let left = and()
    while (isKw(peek(), 'OR')) {
      next()
      const right = and()
      left = { k: 'binary', op: 'OR', left, right, span: span(left.span, right.span) }
    }
    return left
  }
  function and(): Node {
    let left = not()
    while (isKw(peek(), 'AND')) {
      next()
      const right = not()
      left = { k: 'binary', op: 'AND', left, right, span: span(left.span, right.span) }
    }
    return left
  }
  function not(): Node {
    if (isKw(peek(), 'NOT')) {
      const tok = next()
      const arg = not()
      return { k: 'unary', op: 'NOT', arg, span: span(tok.span, arg.span) }
    }
    return compare()
  }
  function compare(): Node {
    let left = additive()
    for (;;) {
      const tok = peek()
      if (tok.t !== 'op' || !COMPARISONS.includes(tok.v)) return left
      next()
      const right = additive()
      left = { k: 'binary', op: tok.v, left, right, span: span(left.span, right.span) }
    }
  }
  function binaryLevel(ops: string[], operand: () => Node): Node {
    let left = operand()
    for (;;) {
      const tok = peek()
      if (tok.t !== 'op' || !ops.includes(tok.v)) return left
      next()
      const right = operand()
      left = { k: 'binary', op: tok.v, left, right, span: span(left.span, right.span) }
    }
  }
  const additive = () => binaryLevel(['+', '-'], multiplicative)
  const multiplicative = () => binaryLevel(['*', '/', '%'], power)
  const power = () => binaryLevel(['^'], unary)
  function unary(): Node {
    if (isOp(peek(), '-')) {
      const tok = next()
      const arg = unary()
      return { k: 'unary', op: '-', arg, span: span(tok.span, arg.span) }
    }
    return primary()
  }

  function primary(): Node {
    const tok = next()
    switch (tok.t) {
      case 'num':
        return { k: 'num', v: tok.v, span: tok.span }
      case 'str':
        return { k: 'str', v: tok.v, span: tok.span }
      case 'date':
        return { k: 'date', text: tok.v, span: tok.span }
      case 'field':
        if (tok.v.trim() === '') throw new CalcError('syntax', 'The brackets [ ] are empty: put a field name between them.', tok.span)
        return { k: 'field', name: tok.v, span: tok.span }
      case 'eof':
        throw new CalcError('syntax', 'The formula ends too soon: something is missing at the end.', tok.span)
      case 'op':
        if (tok.v === '(') {
          const inner = or()
          const close = expectOp(')', tok.span)
          return { ...inner, span: span(tok.span, close.span) }
        }
        throw new CalcError('syntax', `Expected a value, a field or a function before ${tok.v}.`, tok.span)
      case 'id':
        return word(tok)
    }
  }

  function word(tok: Extract<Token, { t: 'id' }>): Node {
    const upper = tok.v.toUpperCase()
    if (upper === 'TRUE' || upper === 'FALSE') return { k: 'bool', v: upper === 'TRUE', span: tok.span }
    if (upper === 'NULL') return { k: 'null', span: tok.span }
    if (upper === 'IF') return ifExpr(tok.span)
    if (upper === 'CASE') return caseExpr(tok.span)
    if (isOp(peek(), '(')) {
      const open = next()
      const args: Node[] = []
      if (!isOp(peek(), ')')) {
        for (;;) {
          args.push(or())
          if (!isOp(peek(), ',')) break
          next()
        }
      }
      const close = expectOp(')', open.span)
      return { k: 'call', name: upper, args, nameSpan: tok.span, span: span(tok.span, close.span) }
    }
    if (KEYWORDS.includes(upper)) throw new CalcError('syntax', `${upper} can’t be used here.`, tok.span)
    return { k: 'name', name: tok.v, span: tok.span }
  }

  function ifExpr(start: Span): Node {
    const branches: { cond: Node; then: Node }[] = []
    let elseNode: Node | undefined
    let cond = or()
    expectKw('THEN', start, 'after the IF condition')
    branches.push({ cond, then: or() })
    for (;;) {
      if (isKw(peek(), 'ELSEIF')) {
        const t = next()
        cond = or()
        expectKw('THEN', t.span, 'after the ELSEIF condition')
        branches.push({ cond, then: or() })
      } else if (isKw(peek(), 'ELSE')) {
        next()
        if (isKw(peek(), 'IF')) throw new CalcError('syntax', 'Write ELSEIF as one word.', peek().span)
        elseNode = or()
        break
      } else break
    }
    const end = expectKw('END', start, 'to close this IF')
    return { k: 'if', branches, else: elseNode, span: span(start, end.span) }
  }

  function caseExpr(start: Span): Node {
    const subject = or()
    const whens: { value: Node; then: Node }[] = []
    let elseNode: Node | undefined
    while (isKw(peek(), 'WHEN')) {
      const w = next()
      const value = or()
      expectKw('THEN', w.span, 'after the WHEN value')
      whens.push({ value, then: or() })
    }
    if (whens.length === 0) throw new CalcError('syntax', `Expected WHEN after the CASE expression, found ${describe(peek())}.`, span(start, peek().span))
    if (isKw(peek(), 'ELSE')) {
      next()
      elseNode = or()
    }
    const end = expectKw('END', start, 'to close this CASE')
    return { k: 'case', subject, whens, else: elseNode, span: span(start, end.span) }
  }

  const tree = or()
  const rest = peek()
  if (rest.t !== 'eof') {
    const hint = rest.t === 'id' && ['THEN', 'ELSE', 'ELSEIF', 'END', 'WHEN'].includes(rest.v.toUpperCase()) ? ` without a matching ${rest.v.toUpperCase() === 'WHEN' ? 'CASE' : 'IF'}` : ''
    throw new CalcError('syntax', `Unexpected ${describe(rest)}${hint}: the formula should end before it, or an operator is missing.`, rest.span)
  }
  return tree
}
