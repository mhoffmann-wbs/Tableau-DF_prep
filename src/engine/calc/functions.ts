// The functions of the calc subset (PLAN.md §7b). Behaviour follows the
// function pages of the Tableau help (string, date, number, logical, type
// conversion and aggregate functions); the docs' own examples are tests in
// calc.test.ts. Where the help is silent, the choice is noted next to the code
// and no exercise depends on it.
import type { Value } from '../model.ts'
import type { Aggregation } from '../spec.ts'
import { DAY_MS, MONTHS, WEEKDAYS } from '../values.ts'
import type { CalcType } from './syntax.ts'

export type Category = 'string' | 'date' | 'number' | 'logical' | 'conversion' | 'aggregate'

export interface FunctionDef {
  name: string
  category: Category
  /** As the help writes it, e.g. `MID(string, start, [length])`. */
  syntax: string
  /** One line, in our words. */
  summary: string
  /** One of the help's examples. */
  example: string
  min: number
  max: number
  /** The first argument is a date part such as 'month'. */
  datePart?: boolean
  /** An aggregation: the argument is row-level and the result is aggregate. */
  agg?: Aggregation
  /** Null arguments don't make the result null. */
  nullSafe?: boolean
  /** The result type from the argument types, or a message saying what's wrong. */
  type: (args: CalcType[]) => CalcType | string
  /** Row-level implementation (not for aggregations, IIF and the logical functions the evaluator handles itself). */
  run?: (args: Value[], types: CalcType[]) => Value
}

// ---- dates ----

/** The date parts the subset supports, as the help lists them. */
export const DATE_PARTS = ['year', 'quarter', 'month', 'dayofyear', 'day', 'weekday', 'week', 'hour', 'minute', 'second'] as const
export type CalcDatePart = (typeof DATE_PARTS)[number]

const WEEK_STARTS = WEEKDAYS.map((d) => d.toLowerCase())

/** 0 = Sunday … 6 = Saturday. Without a start of week, the help leaves it to the data source; Driftlight's is Sunday, as in the rest of the engine. */
export function weekStart(name: Value | undefined): number {
  if (name === undefined || name === null) return 0
  const i = WEEK_STARTS.indexOf(String(name).toLowerCase())
  if (i < 0) throw new Error(`${String(name)} isn’t a day of the week.`)
  return i
}

const parts = (ms: number) => {
  const d = new Date(ms)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes(), s: d.getUTCSeconds() }
}

function truncWeek(ms: number, start: number): number {
  const { y, m, day, wd } = parts(ms)
  return Date.UTC(y, m, day - ((wd - start + 7) % 7))
}

export function calcDatePart(part: CalcDatePart, ms: number, start = 0): number {
  const { y, m, day, wd, h, min, s } = parts(ms)
  switch (part) {
    case 'year':
      return y
    case 'quarter':
      return Math.floor(m / 3) + 1
    case 'month':
      return m + 1
    case 'dayofyear':
      return Math.round((Date.UTC(y, m, day) - Date.UTC(y, 0, 1)) / DAY_MS) + 1
    case 'day':
      return day
    case 'weekday':
      return ((wd - start + 7) % 7) + 1
    case 'week': {
      // Week 1 is the week that holds January 1.
      const jan1 = Date.UTC(y, 0, 1)
      return Math.round((truncWeek(ms, start) - truncWeek(jan1, start)) / (7 * DAY_MS)) + 1
    }
    case 'hour':
      return h
    case 'minute':
      return min
    case 'second':
      return s
  }
}

export function calcDateTrunc(part: CalcDatePart, ms: number, start = 0): number {
  const { y, m, day, h, min, s } = parts(ms)
  switch (part) {
    case 'year':
      return Date.UTC(y, 0, 1)
    case 'quarter':
      return Date.UTC(y, Math.floor(m / 3) * 3, 1)
    case 'month':
      return Date.UTC(y, m, 1)
    case 'week':
      return truncWeek(ms, start)
    case 'hour':
      return Date.UTC(y, m, day, h)
    case 'minute':
      return Date.UTC(y, m, day, h, min)
    case 'second':
      return Date.UTC(y, m, day, h, min, s)
    default:
      return Date.UTC(y, m, day)
  }
}

export function calcDateAdd(part: CalcDatePart, n: number, ms: number): number {
  const { y, m, day, h, min, s } = parts(ms)
  const ms0 = ms - Date.UTC(y, m, day, h, min, s)
  const months = part === 'year' ? 12 * n : part === 'quarter' ? 3 * n : part === 'month' ? n : 0
  if (months) {
    // The help doesn't say what happens to Jan 31 + 1 month; this keeps the day within the month.
    const last = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate()
    return Date.UTC(y, m + months, Math.min(day, last), h, min, s) + ms0
  }
  const unit = { week: 7 * DAY_MS, day: DAY_MS, dayofyear: DAY_MS, weekday: DAY_MS, hour: 3_600_000, minute: 60_000, second: 1000 }[part as string]!
  return ms + n * unit
}

/** Counts the date-part boundaries between the dates, as the help's week example shows. */
export function calcDateDiff(part: CalcDatePart, a: number, b: number, start = 0): number {
  const pa = parts(a)
  const pb = parts(b)
  switch (part) {
    case 'year':
      return pb.y - pa.y
    case 'quarter':
      return pb.y * 4 + Math.floor(pb.m / 3) - (pa.y * 4 + Math.floor(pa.m / 3))
    case 'month':
      return pb.y * 12 + pb.m - (pa.y * 12 + pa.m)
    case 'week':
      return Math.round((truncWeek(b, start) - truncWeek(a, start)) / (7 * DAY_MS))
    case 'hour':
      return Math.floor(b / 3_600_000) - Math.floor(a / 3_600_000)
    case 'minute':
      return Math.floor(b / 60_000) - Math.floor(a / 60_000)
    case 'second':
      return Math.floor(b / 1000) - Math.floor(a / 1000)
    default:
      return Math.round((calcDateTrunc('day', b) - calcDateTrunc('day', a)) / DAY_MS)
  }
}

/** DATENAME: month and weekday names; other parts as their number in text. */
function dateName(part: CalcDatePart, ms: number, start: number): string {
  if (part === 'month') return MONTHS[calcDatePart('month', ms) - 1]!
  if (part === 'weekday') return WEEKDAYS[new Date(ms).getUTCDay()]!
  return String(calcDatePart(part, ms, start))
}

const MONTH_INDEX = new Map(MONTHS.flatMap((name, i) => [[name.toLowerCase(), i] as const, [name.slice(0, 3).toLowerCase(), i] as const]))

/**
 * Reads a date as date literals and DATE() write it: ISO (`2024-03-25`), US
 * (`3/25/2024`) or long form (`March 25, 2024`), each with an optional time.
 */
export function parseDateText(text: string): { ms: number; time: boolean } | undefined {
  const t = text.trim()
  let y: number, m: number, d: number
  let rest: string
  let match: RegExpExecArray | null
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(t))) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
    rest = match[4]!
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)$/.exec(t))) {
    const yy = Number(match[3])
    ;[y, m, d] = [match[3]!.length === 2 ? 2000 + yy : yy, Number(match[1]) - 1, Number(match[2])]
    rest = match[4]!
  } else if ((match = /^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})(.*)$/.exec(t))) {
    const month = MONTH_INDEX.get(match[1]!.toLowerCase())
    if (month === undefined) return undefined
    ;[y, m, d] = [Number(match[3]), month, Number(match[2])]
    rest = match[4]!
  } else return undefined
  if (m < 0 || m > 11 || d < 1 || d > new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) return undefined
  rest = rest.trim().replace(/^T/, '')
  if (rest === '') return { ms: Date.UTC(y, m, d), time: false }
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(rest)
  if (!tm) return undefined
  let h = Number(tm[1])
  if (tm[4]) h = (h % 12) + (tm[4].toLowerCase() === 'pm' ? 12 : 0)
  if (h > 23 || Number(tm[2]) > 59 || Number(tm[3] ?? 0) > 59) return undefined
  return { ms: Date.UTC(y, m, d, h, Number(tm[2]), Number(tm[3] ?? 0)), time: true }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** How STR and the playground show a date: ISO, with the time for datetimes. */
export function formatDate(ms: number, time: boolean): string {
  const { y, m, day, h, min, s } = parts(ms)
  const date = `${pad(y, 4)}-${pad(m + 1)}-${pad(day)}`
  return time ? `${date} ${pad(h)}:${pad(min)}:${pad(s)}` : date
}

/** TODAY() is pinned, so exercise answers never change. */
export const CALC_TODAY = '2026-01-01'
const TODAY_MS = Date.parse(`${CALC_TODAY}T00:00:00Z`)

// ---- type rules ----

const isDate = (t: CalcType) => t === 'date' || t === 'datetime'
const fits = (t: CalcType, kind: 'number' | 'string' | 'boolean' | 'date') => t === 'null' || t === kind || (kind === 'date' && isDate(t))
const NAMES: Record<CalcType, string> = { number: 'a number', string: 'a string', boolean: 'a Boolean', date: 'a date', datetime: 'a date and time', null: 'Null' }
export const typeName = (t: CalcType) => NAMES[t]

/** Checks arguments against expected kinds; returns a message for the first mismatch. */
function want(name: string, args: CalcType[], kinds: ('number' | 'string' | 'boolean' | 'date' | 'any')[]): string | undefined {
  for (const [i, t] of args.entries()) {
    const k = kinds[Math.min(i, kinds.length - 1)]!
    if (k !== 'any' && !fits(t, k)) return `${name} expects ${NAMES[k]} as argument ${i + 1}, but it gets ${NAMES[t]}.`
  }
  return undefined
}

const typed = (name: string, kinds: Parameters<typeof want>[2], result: CalcType) => (args: CalcType[]) => want(name, args, kinds) ?? result

/** Two values that can stand in the same place: equal types, either Null, or a date with a datetime. */
export function unify(a: CalcType, b: CalcType): CalcType | undefined {
  if (a === 'null') return b
  if (b === 'null' || a === b) return a
  if (isDate(a) && isDate(b)) return 'datetime'
  return undefined
}

// ---- implementations ----

const str = (v: Value | undefined) => v as string
const num = (v: Value | undefined) => v as number

function round(n: number, digits: number): number {
  // The help doesn't say how halves round; this rounds them away from zero.
  const f = 10 ** digits
  return (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f
}

function toStr(v: Value, t: CalcType): Value {
  if (t === 'boolean') return v ? '1' : '0' // the help: True → "1", False → "0"
  if (isDate(t)) return formatDate(num(v), t === 'datetime')
  return String(v)
}

function toNumber(v: Value, t: CalcType): number | null {
  if (t === 'boolean') return v ? 1 : 0
  if (t === 'string') {
    const n = Number(str(v).trim())
    return str(v).trim() === '' || Number.isNaN(n) ? null : n
  }
  return num(v)
}

const f = (def: Omit<FunctionDef, 'min' | 'max'> & { min?: number; max?: number }, arity: number): FunctionDef => ({ min: arity, max: arity, ...def })

export const FUNCTIONS: FunctionDef[] = [
  // ---- string ----
  f({ name: 'LEFT', category: 'string', syntax: 'LEFT(string, number)', summary: 'The first <number> characters.', example: 'LEFT("Matador", 4) = "Mata"', type: typed('LEFT', ['string', 'number'], 'string'), run: ([s, n]) => str(s).slice(0, Math.max(0, num(n))) }, 2),
  f({ name: 'RIGHT', category: 'string', syntax: 'RIGHT(string, number)', summary: 'The last <number> characters.', example: 'RIGHT("Calculation", 4) = "tion"', type: typed('RIGHT', ['string', 'number'], 'string'), run: ([s, n]) => (num(n) <= 0 ? '' : str(s).slice(-num(n))) }, 2),
  {
    name: 'MID',
    category: 'string',
    syntax: 'MID(string, start, [length])',
    summary: 'The characters from position <start> (the first is 1), optionally only <length> of them.',
    example: 'MID("Calculation", 2, 5) = "alcul"',
    min: 2,
    max: 3,
    type: typed('MID', ['string', 'number'], 'string'),
    run: ([s, start, len]) => {
      const from = Math.max(0, num(start) - 1)
      return len === undefined ? str(s).slice(from) : str(s).slice(from, from + Math.max(0, num(len)))
    },
  },
  f({ name: 'LEN', category: 'string', syntax: 'LEN(string)', summary: 'The number of characters.', example: 'LEN("Matador") = 7', type: typed('LEN', ['string'], 'number'), run: ([s]) => str(s).length }, 1),
  f({ name: 'UPPER', category: 'string', syntax: 'UPPER(string)', summary: 'All in capitals.', example: 'UPPER("Calculation") = "CALCULATION"', type: typed('UPPER', ['string'], 'string'), run: ([s]) => str(s).toUpperCase() }, 1),
  f({ name: 'LOWER', category: 'string', syntax: 'LOWER(string)', summary: 'All in lower case.', example: 'LOWER("ProductVersion") = "productversion"', type: typed('LOWER', ['string'], 'string'), run: ([s]) => str(s).toLowerCase() }, 1),
  f({ name: 'TRIM', category: 'string', syntax: 'TRIM(string)', summary: 'Without leading and trailing spaces.', example: 'TRIM(" Calculation ") = "Calculation"', type: typed('TRIM', ['string'], 'string'), run: ([s]) => str(s).replace(/^ +| +$/g, '') }, 1),
  f({ name: 'LTRIM', category: 'string', syntax: 'LTRIM(string)', summary: 'Without leading spaces.', example: 'LTRIM(" Matador ") = "Matador "', type: typed('LTRIM', ['string'], 'string'), run: ([s]) => str(s).replace(/^ +/, '') }, 1),
  f({ name: 'RTRIM', category: 'string', syntax: 'RTRIM(string)', summary: 'Without trailing spaces.', example: 'RTRIM(" Calculation ") = " Calculation"', type: typed('RTRIM', ['string'], 'string'), run: ([s]) => str(s).replace(/ +$/, '') }, 1),
  // The help: CONTAINS "may be case sensitive" depending on the data source. Here it is.
  f({ name: 'CONTAINS', category: 'string', syntax: 'CONTAINS(string, substring)', summary: 'TRUE if <substring> occurs in the string (case-sensitive here).', example: 'CONTAINS("Calculation", "alcu") = true', type: typed('CONTAINS', ['string'], 'boolean'), run: ([s, sub]) => str(s).includes(str(sub)) }, 2),
  f({ name: 'STARTSWITH', category: 'string', syntax: 'STARTSWITH(string, substring)', summary: 'TRUE if the string starts with <substring>; leading spaces are ignored.', example: 'STARTSWITH("Matador", "Ma") = TRUE', type: typed('STARTSWITH', ['string'], 'boolean'), run: ([s, sub]) => str(s).trimStart().startsWith(str(sub)) }, 2),
  f({ name: 'ENDSWITH', category: 'string', syntax: 'ENDSWITH(string, substring)', summary: 'TRUE if the string ends with <substring>; trailing spaces are ignored.', example: 'ENDSWITH("Tableau", "leau") = true', type: typed('ENDSWITH', ['string'], 'boolean'), run: ([s, sub]) => str(s).trimEnd().endsWith(str(sub)) }, 2),
  {
    name: 'FIND',
    category: 'string',
    syntax: 'FIND(string, substring, [start])',
    summary: 'The position of <substring> (the first character is 1), or 0 if it isn’t there.',
    example: 'FIND("Calculation", "a", 3) = 7',
    min: 2,
    max: 3,
    type: typed('FIND', ['string', 'string', 'number'], 'number'),
    run: ([s, sub, start]) => str(s).indexOf(str(sub), start === undefined ? 0 : Math.max(0, num(start) - 1)) + 1,
  },
  f({ name: 'REPLACE', category: 'string', syntax: 'REPLACE(string, substring, replacement)', summary: 'Replaces <substring> with <replacement>; the string is unchanged if it isn’t found.', example: 'REPLACE("Version 3.8", "3.8", "4x") = "Version 4x"', type: typed('REPLACE', ['string'], 'string'), run: ([s, sub, rep]) => (str(sub) === '' ? str(s) : str(s).split(str(sub)).join(str(rep))) }, 3),
  f(
    {
      name: 'SPLIT',
      category: 'string',
      syntax: 'SPLIT(string, delimiter, token number)',
      summary: 'Cuts the string at each <delimiter> and returns one piece, counted from the left (1, 2…) or, when negative, from the right.',
      example: 'SPLIT("a-b-c-d", "-", 2) = "b"',
      type: typed('SPLIT', ['string', 'string', 'number'], 'string'),
      run: ([s, d, n]) => {
        const pieces = str(d) === '' ? [str(s)] : str(s).split(str(d))
        const i = num(n) > 0 ? num(n) - 1 : pieces.length + num(n)
        return pieces[i] ?? '' // the help doesn't say what a missing token gives
      },
    },
    3,
  ),

  // ---- date ----
  { name: 'DATEPART', category: 'date', syntax: "DATEPART(date_part, date, [start_of_week])", summary: 'A part of the date as a whole number.', example: "DATEPART('month', #1986-03-25#) = 3", min: 2, max: 3, datePart: true, type: typed('DATEPART', ['string', 'date', 'string'], 'number'), run: ([p, d, w]) => calcDatePart(p as CalcDatePart, num(d), weekStart(w)) },
  { name: 'DATENAME', category: 'date', syntax: "DATENAME(date_part, date, [start_of_week])", summary: 'A part of the date as text.', example: "DATENAME('month', #1986-03-25#) = \"March\"", min: 2, max: 3, datePart: true, type: typed('DATENAME', ['string', 'date', 'string'], 'string'), run: ([p, d, w]) => dateName(p as CalcDatePart, num(d), weekStart(w)) },
  { name: 'DATETRUNC', category: 'date', syntax: "DATETRUNC(date_part, date, [start_of_week])", summary: 'The date cut back to the start of its year, quarter, month, week or day.', example: "DATETRUNC('quarter', #9/22/2018#) = #7/1/2018#", min: 2, max: 3, datePart: true, type: (a) => want('DATETRUNC', a, ['string', 'date', 'string']) ?? 'date', run: ([p, d, w]) => calcDateTrunc(p as CalcDatePart, num(d), weekStart(w)) },
  { name: 'DATEADD', category: 'date', syntax: 'DATEADD(date_part, interval, date)', summary: 'The date plus <interval> date parts (a negative interval goes back).', example: "DATEADD('day', 280, #2/20/21#) = #November 27, 2021#", min: 3, max: 3, datePart: true, type: (a) => want('DATEADD', a, ['string', 'number', 'date']) ?? (a[2] === 'null' ? 'date' : a[2]!), run: ([p, n, d]) => calcDateAdd(p as CalcDatePart, num(n), num(d)) },
  { name: 'DATEDIFF', category: 'date', syntax: 'DATEDIFF(date_part, date1, date2, [start_of_week])', summary: 'How many date parts from <date1> to <date2>.', example: "DATEDIFF('day', #3/25/1986#, #2/20/2021#) = 12751", min: 3, max: 4, datePart: true, type: typed('DATEDIFF', ['string', 'date', 'date', 'string'], 'number'), run: ([p, a, b, w]) => calcDateDiff(p as CalcDatePart, num(a), num(b), weekStart(w)) },
  f({ name: 'MAKEDATE', category: 'date', syntax: 'MAKEDATE(year, month, day)', summary: 'A date from three numbers; an impossible day rolls over into the next month.', example: 'MAKEDATE(1986, 3, 25) = #1986-03-25#', type: typed('MAKEDATE', ['number'], 'date'), run: ([y, m, d]) => Date.UTC(num(y), num(m) - 1, num(d)) }, 3),
  f({ name: 'TODAY', category: 'date', syntax: 'TODAY()', summary: `Today’s date (pinned to ${CALC_TODAY} here).`, example: 'TODAY() = 1986-03-25', type: () => 'date', run: () => TODAY_MS }, 0),
  f({ name: 'YEAR', category: 'date', syntax: 'YEAR(date)', summary: 'The year as a number.', example: 'YEAR(#1986-03-25#) = 1986', type: typed('YEAR', ['date'], 'number'), run: ([d]) => calcDatePart('year', num(d)) }, 1),
  f({ name: 'QUARTER', category: 'date', syntax: 'QUARTER(date)', summary: 'The quarter as a number, 1 to 4.', example: 'QUARTER(#1986-03-25#) = 1', type: typed('QUARTER', ['date'], 'number'), run: ([d]) => calcDatePart('quarter', num(d)) }, 1),
  f({ name: 'MONTH', category: 'date', syntax: 'MONTH(date)', summary: 'The month as a number, 1 to 12.', example: 'MONTH(#1986-03-25#) = 3', type: typed('MONTH', ['date'], 'number'), run: ([d]) => calcDatePart('month', num(d)) }, 1),
  f({ name: 'DAY', category: 'date', syntax: 'DAY(date)', summary: 'The day of the month as a number.', example: 'DAY(#1986-03-25#) = 25', type: typed('DAY', ['date'], 'number'), run: ([d]) => calcDatePart('day', num(d)) }, 1),

  // ---- number ----
  {
    name: 'ROUND',
    category: 'number',
    syntax: 'ROUND(number, [decimals])',
    summary: 'Rounded to <decimals> places, or to a whole number without it.',
    example: 'ROUND(1/3, 2) = 0.33',
    min: 1,
    max: 2,
    type: typed('ROUND', ['number'], 'number'),
    run: ([n, d]) => round(num(n), d === undefined ? 0 : Math.trunc(num(d))),
  },
  f({ name: 'ABS', category: 'number', syntax: 'ABS(number)', summary: 'The number without its sign.', example: 'ABS(-7) = 7', type: typed('ABS', ['number'], 'number'), run: ([n]) => Math.abs(num(n)) }, 1),
  f({ name: 'CEILING', category: 'number', syntax: 'CEILING(number)', summary: 'Rounded up to a whole number.', example: 'CEILING(2.1) = 3', type: typed('CEILING', ['number'], 'number'), run: ([n]) => Math.ceil(num(n)) }, 1),
  f({ name: 'FLOOR', category: 'number', syntax: 'FLOOR(number)', summary: 'Rounded down to a whole number.', example: 'FLOOR(7.9) = 7', type: typed('FLOOR', ['number'], 'number'), run: ([n]) => Math.floor(num(n)) }, 1),
  f({ name: 'ZN', category: 'number', syntax: 'ZN(expression)', summary: 'The value, or 0 if it is null.', example: 'ZN([Test Grade])', nullSafe: true, type: typed('ZN', ['number'], 'number'), run: ([v]) => v ?? 0 }, 1),

  // ---- logical (IIF, IFNULL and ISNULL are evaluated lazily or null-safe) ----
  { name: 'IIF', category: 'logical', syntax: 'IIF(test, then, else, [unknown])', summary: '<then> if the test is true, <else> if it is false, <unknown> (or Null) if it is null.', example: "IIF([Season] = 'Summer', 'Sandals', 'Other footwear')", min: 3, max: 4, nullSafe: true, type: (a) => {
    if (!fits(a[0]!, 'boolean')) return `IIF expects a TRUE/FALSE test as argument 1, but it gets ${NAMES[a[0]!]}.`
    const t = a.slice(1).reduce<CalcType | undefined>((acc, x) => (acc === undefined ? undefined : unify(acc, x)), 'null')
    return t ?? `IIF returns ${a.slice(1).map((x) => NAMES[x]).join(' and ')}: every result must have the same type.`
  } },
  f({ name: 'IFNULL', category: 'logical', syntax: 'IFNULL(expr1, expr2)', summary: '<expr1> if it isn’t null, otherwise <expr2>.', example: 'IFNULL([Assigned Room], "TBD")', nullSafe: true, type: ([a, b]) => unify(a!, b!) ?? `IFNULL needs two values of the same type, but it gets ${NAMES[a!]} and ${NAMES[b!]}.`, run: ([a, b]) => a ?? b! }, 2),
  f({ name: 'ISNULL', category: 'logical', syntax: 'ISNULL(expression)', summary: 'TRUE if the value is null.', example: 'ISNULL([Assigned Room])', nullSafe: true, type: () => 'boolean', run: ([v]) => v === null }, 1),

  // ---- type conversion ----
  f({ name: 'STR', category: 'conversion', syntax: 'STR(expression)', summary: 'The value as a string.', example: 'STR([ID])', type: () => 'string', run: ([v], [t]) => toStr(v!, t!) }, 1),
  f({
    name: 'INT',
    category: 'conversion',
    syntax: 'INT(expression)',
    summary: 'A whole number: numbers are cut toward zero; text is read as a number and rounded.',
    example: 'INT(-9.7) = -9',
    type: (a) => (isDate(a[0]!) ? 'INT expects a number, a string or a Boolean, but it gets a date.' : 'number'),
    run: ([v], [t]) => {
      const n = toNumber(v!, t!)
      if (n === null) return null
      return t === 'string' ? round(n, 0) : Math.trunc(n)
    },
  }, 1),
  f({ name: 'FLOAT', category: 'conversion', syntax: 'FLOAT(expression)', summary: 'The value as a decimal number.', example: 'FLOAT(3) = 3.000', type: (a) => (isDate(a[0]!) ? 'FLOAT expects a number, a string or a Boolean, but it gets a date.' : 'number'), run: ([v], [t]) => toNumber(v!, t!) }, 1),
  f({
    name: 'DATE',
    category: 'conversion',
    syntax: 'DATE(expression)',
    summary: 'A date from a string such as "2024-03-25" or "March 25, 2024", or the date part of a date and time.',
    example: 'DATE("September 22, 2018")',
    type: (a) => (fits(a[0]!, 'string') || isDate(a[0]!) ? 'date' : `DATE expects a string or a date here, but it gets ${NAMES[a[0]!]}.`),
    run: ([v], [t]) => (t === 'string' ? (parseDateText(str(v!)) ? calcDateTrunc('day', parseDateText(str(v!))!.ms) : null) : calcDateTrunc('day', num(v!))),
  }, 1),

  // ---- aggregate ----
  f({ name: 'SUM', category: 'aggregate', syntax: 'SUM(expression)', summary: 'The total; nulls are ignored.', example: 'SUM([Minutes Watched])', agg: 'sum', type: typed('SUM', ['number'], 'number') }, 1),
  f({ name: 'AVG', category: 'aggregate', syntax: 'AVG(expression)', summary: 'The mean; nulls are ignored.', example: 'AVG([Minutes Watched])', agg: 'avg', type: typed('AVG', ['number'], 'number') }, 1),
  f({ name: 'MEDIAN', category: 'aggregate', syntax: 'MEDIAN(expression)', summary: 'The middle value; nulls are ignored.', example: 'MEDIAN([Minutes Watched])', agg: 'median', type: typed('MEDIAN', ['number'], 'number') }, 1),
  f({ name: 'COUNT', category: 'aggregate', syntax: 'COUNT(expression)', summary: 'How many values; nulls aren’t counted.', example: 'COUNT([Session ID])', agg: 'count', type: () => 'number' }, 1),
  f({ name: 'COUNTD', category: 'aggregate', syntax: 'COUNTD(expression)', summary: 'How many distinct values; nulls aren’t counted.', example: 'COUNTD([Subscriber ID])', agg: 'countd', type: () => 'number' }, 1),
  f({ name: 'ATTR', category: 'aggregate', syntax: 'ATTR(expression)', summary: 'The value if every row has the same one, otherwise *.', example: 'ATTR([Genre])', agg: 'attr', type: ([a]) => a! }, 1),
  // MIN and MAX: one argument aggregates, two compare row by row.
  { name: 'MIN', category: 'aggregate', syntax: 'MIN(expression) or MIN(expr1, expr2)', summary: 'The smallest value, or the smaller of two.', example: 'MIN(4, 7) = 4', min: 1, max: 2, agg: 'min', type: (a) => (a.length === 1 ? a[0]! : (unify(a[0]!, a[1]!) ?? `MIN compares two values of the same type, but it gets ${NAMES[a[0]!]} and ${NAMES[a[1]!]}.`)), run: ([a, b]) => ((a as number | string) <= (b as number | string) ? a! : b!) },
  { name: 'MAX', category: 'aggregate', syntax: 'MAX(expression) or MAX(expr1, expr2)', summary: 'The largest value, or the larger of two.', example: 'MAX(4, 7) = 7', min: 1, max: 2, agg: 'max', type: (a) => (a.length === 1 ? a[0]! : (unify(a[0]!, a[1]!) ?? `MAX compares two values of the same type, but it gets ${NAMES[a[0]!]} and ${NAMES[a[1]!]}.`)), run: ([a, b]) => ((a as number | string) >= (b as number | string) ? a! : b!) },
]

export const FUNCTION_BY_NAME = new Map(FUNCTIONS.map((fn) => [fn.name, fn]))

/** Whether a call aggregates: SUM(x), or MIN/MAX with one argument. */
export const isAggregateCall = (fn: FunctionDef, argCount: number) => fn.agg !== undefined && !((fn.name === 'MIN' || fn.name === 'MAX') && argCount === 2)

export const CATEGORY_LABEL: Record<Category, string> = {
  string: 'String',
  date: 'Date',
  number: 'Number',
  logical: 'Logical',
  conversion: 'Type conversion',
  aggregate: 'Aggregate',
}

