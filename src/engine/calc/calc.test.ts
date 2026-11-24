import { describe, expect, it } from 'vitest'
import { referenceData, testDataset } from '../../test/dataset'
import { calcFields, fieldOf } from '../model'
import { EngineError, resolvePill } from '../pills'
import { columnOf, query } from '../query'
import { type VizSpec, vizSpecSchema } from '../spec'
import { CalcError, compileFormula, evaluateRow, type FieldLookup, MIX_MESSAGE } from './index'

const FIELDS: Record<string, { type: 'number' | 'string' | 'date' | 'datetime' | 'boolean'; level: 'row' | 'agg' }> = {
  Sales: { type: 'number', level: 'row' },
  Profit: { type: 'number', level: 'row' },
  Name: { type: 'string', level: 'row' },
  Day: { type: 'date', level: 'row' },
  Margin: { type: 'number', level: 'agg' },
}
const lookup: FieldLookup = (name) => FIELDS[name] ?? `There is no field [${name}].`
const noCalcs = { calc: () => undefined }

/** Evaluates a formula with no fields, as the help's examples do. */
const calc = (formula: string) => evaluateRow(noCalcs, compileFormula(formula, lookup), {})
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
const fail = (formula: string): CalcError => {
  try {
    compileFormula(formula, lookup)
  } catch (e) {
    if (e instanceof CalcError) return e
    throw e
  }
  throw new Error(`${formula} compiled`)
}

describe('the help’s examples', () => {
  it.each([
    ['LEFT("Matador", 4)', 'Mata'],
    ['RIGHT("Calculation", 4)', 'tion'],
    ['MID("Calculation", 2)', 'alculation'],
    ['MID("Calculation", 2, 5)', 'alcul'],
    ['LEN("Matador")', 7],
    ['UPPER("Calculation")', 'CALCULATION'],
    ['LOWER("ProductVersion")', 'productversion'],
    ['TRIM(" Calculation ")', 'Calculation'],
    ['LTRIM(" Matador ")', 'Matador '],
    ['RTRIM(" Calculation ")', ' Calculation'],
    ['CONTAINS("Calculation", "alcu")', true],
    ['STARTSWITH("Matador", "Ma")', true],
    ['ENDSWITH("Tableau", "leau")', true],
    ['FIND("Calculation", "alcu")', 2],
    ['FIND("Calculation", "Computer")', 0],
    ['FIND("Calculation", "a", 3)', 7],
    ['FIND("Calculation", "a", 2)', 2],
    ['FIND("Calculation", "a", 8)', 0],
    ['REPLACE("Version 3.8", "3.8", "4x")', 'Version 4x'],
    ['SPLIT("a-b-c-d", "-", 2)', 'b'],
    ['SPLIT("a|b|c|d", "|", -2)', 'c'],
    ['SPLIT("abc-defgh-i-jkl", "-", 4)', 'jkl'],
    ["DATEPART('year', #1986-03-25#)", 1986],
    ["DATEPART('month', #1986-03-25#)", 3],
    ["DATENAME('year', #3/25/1986#)", '1986'],
    ["DATENAME('month', #1986-03-25#)", 'March'],
    ["DATETRUNC('day', #9/22/2018#)", day(2018, 9, 22)],
    ['DATETRUNC(quarter, #9/22/2018#)', day(2018, 7, 1)],
    ["DATEADD('day', 280, #2/20/21#)", day(2021, 11, 27)],
    ["DATEDIFF('day', #3/25/1986#, #2/20/2021#)", 12751],
    ["DATEDIFF('week', #2013-09-22#, #2013-09-24#, 'monday')", 1],
    ["DATEDIFF('week', #2013-09-22#, #2013-09-24#, 'sunday')", 0],
    ['MAKEDATE(1986, 3, 25)', day(1986, 3, 25)],
    ['MAKEDATE(2020, 4, 31)', day(2020, 5, 1)],
    ['YEAR(#1986-03-25#)', 1986],
    ['QUARTER(#1986-03-25#)', 1],
    ['ROUND(1/3, 2)', 0.33],
    ['ABS(-7)', 7],
    ['CEILING(2.1)', 3],
    ['FLOOR(7.9)', 7],
    ['INT(8/3)', 2],
    ['INT(-9.7)', -9],
    ['FLOAT(3)', 3],
    ['INT(TRUE)', 1],
    ['STR(FALSE)', '0'],
    ['DATE("September 22, 2018")', day(2018, 9, 22)],
    ['DATE("9/22/2018")', day(2018, 9, 22)],
    ['DATE(#2018-09-22 14:52#)', day(2018, 9, 22)],
    ['MIN(4, 7)', 4],
    ['MAX(4, 7)', 7],
    ['MIN(#3/25/1986#, #2/20/2021#)', day(1986, 3, 25)],
    ["IIF('A' = 'A', 'Red', IIF('B' = 'B', 'Orange', IIF('C' = 'D', 'Yellow', 'Green')))", 'Red'],
    ['2*1+2', 4],
    ['(1 + (2*2+1)*(3*6/3) )', 31],
    ['9 % 2', 1],
    ["'abc' + 'def'", 'abcdef'],
    ['#April 15, 2024# + 15', day(2024, 4, 30)],
    ['#April 16, 2024# - 15', day(2024, 4, 1)],
    ['#April 15, 2024# - #April 8, 2024#', 7],
    ['-(7+3)', -10],
    ['6^3', 216],
    ["'O''Hanrahan'", "O'Hanrahan"],
    ['"She\'s my friend."', "She's my friend."],
    ['1 + 1 // a comment', 2],
  ])('%s = %j', (formula, expected) => {
    expect(calc(formula)).toEqual(expected)
  })
})

describe('nulls', () => {
  it('propagate through operators and functions', () => {
    expect(calc('1 + NULL')).toBeNull()
    expect(calc('UPPER(NULL)')).toBeNull()
    expect(calc('NULL = NULL')).toBeNull()
    expect(calc('7 > NULL')).toBeNull()
  })
  it('follow the help for IF, CASE, IIF, IFNULL, ISNULL and ZN', () => {
    expect(calc("IF NULL THEN 'a' ELSE 'b' END")).toBe('b')
    expect(calc("IF FALSE THEN 'a' END")).toBeNull()
    expect(calc("CASE NULL WHEN 1 THEN 'a' ELSE 'b' END")).toBe('b')
    expect(calc("IIF(NULL, 'a', 'b')")).toBeNull()
    expect(calc("IIF(NULL, 'a', 'b', 'unknown')")).toBe('unknown')
    expect(calc('IFNULL(NULL, "TBD")')).toBe('TBD')
    expect(calc('ISNULL(NULL)')).toBe(true)
    expect(calc('ZN(NULL)')).toBe(0)
  })
  it('make AND and OR skip the right side once the left decides', () => {
    expect(calc('FALSE AND NULL')).toBe(false)
    expect(calc('TRUE OR NULL')).toBe(true)
    expect(calc('TRUE AND NULL')).toBeNull()
  })
  it('return Null for a division by zero', () => {
    expect(calc('1 / 0')).toBeNull()
  })
})

describe('syntax', () => {
  it('follows the help’s operator precedence', () => {
    expect(calc('-2 ^ 2')).toBe(4) // negation binds before ^
    expect(calc('NOT 1 = 2')).toBe(true) // comparisons before NOT
    expect(calc('TRUE OR FALSE AND FALSE')).toBe(true) // AND before OR
    expect(calc('10 - 4 - 3')).toBe(3) // left to right
  })
  it('is case-insensitive for keywords and functions', () => {
    expect(calc("if true then upper('a') end")).toBe('A')
  })
  it('accepts == and <>, comments and CASE', () => {
    expect(calc('1 == 1 AND 1 <> 2 /* both */')).toBe(true)
    expect(calc("CASE 'Winter' WHEN 'Summer' THEN 'Sandals' WHEN 'Winter' THEN 'Boots' ELSE 'Sneakers' END")).toBe('Boots')
  })
  it.each([
    ['IF [Sales] > 0 THEN 1', 'END'],
    ['UPPER([Name]', ')'],
    ['[Sales] +', 'ends too soon'],
    ["'open", 'no closing'],
    ['Sales * 2', '[Sales]'],
    ['ELSE 1', 'ELSE'],
    ['[Sales] 2', 'Unexpected'],
  ])('reports %s', (formula, part) => {
    expect(fail(formula).message).toContain(part)
  })
  it('points at the problem', () => {
    const e = fail('UPPER([Nmae])')
    expect(e.kind).toBe('field')
    expect('UPPER([Nmae])'.slice(e.span!.start, e.span!.end)).toBe('[Nmae]')
  })
})

describe('types', () => {
  it.each([
    ["[Name] + 1", 'STR()'],
    ['UPPER([Sales])', 'expects a string'],
    ["IF [Sales] > 0 THEN 'big' ELSE 0 END", 'same type'],
    ["DATEPART('fortnight', [Day])", 'isn’t a date part'],
    ["DATETRUNC('weekday', [Day])", 'can’t use'],
    ['LEFT([Name])', 'takes 2 arguments'],
    ['FOO([Sales])', 'functions this playground knows'],
    ['IF [Sales] THEN 1 END', 'TRUE or FALSE'],
  ])('rejects %s', (formula, part) => {
    expect(fail(formula).message).toContain(part)
  })
  it('gives each formula a type', () => {
    expect(compileFormula("DATETRUNC('month', [Day])", lookup).type).toBe('date')
    expect(compileFormula('[Day] - [Day]', lookup).type).toBe('number')
    expect(compileFormula("[Name] + ', ' + [Name]", lookup).type).toBe('string')
  })
})

describe('aggregation', () => {
  it('tells row-level from aggregate calculations', () => {
    expect(compileFormula('[Sales] / 60', lookup).aggregate).toBe(false)
    expect(compileFormula('SUM([Profit]) / SUM([Sales])', lookup).aggregate).toBe(true)
    expect(compileFormula('SUM([Sales] * 7)', lookup).aggregate).toBe(true)
    expect(compileFormula('SUM([Sales]) * 7', lookup).aggregate).toBe(true)
    expect(compileFormula('[Margin] * 100', lookup).aggregate).toBe(true)
  })
  it.each(['[Sales] - AVG([Sales])', 'SUM([Sales]) * [Profit]', 'MAX(SUM([Sales]), [Profit])', 'IF [Sales] > 0 THEN SUM([Profit]) END', '[Margin] + [Sales]'])(
    'rejects mixing in %s with Tableau’s message',
    (formula) => {
      const e = fail(formula)
      expect(e.kind).toBe('mix')
      expect(e.message).toBe(MIX_MESSAGE)
      expect(e.explain).toContain('computed for every row')
    },
  )
  it('accepts the help’s valid forms', () => {
    for (const f of ['SUM([Sales] * [Profit])', 'SUM([Sales]) * SUM([Profit])', 'MAX(SUM([Sales]), SUM([Profit]))', 'IIF(SUM([Sales]) != 0, SUM([Profit]) / SUM([Sales]), 0)'])
      expect(compileFormula(f, lookup).aggregate).toBe(true)
  })
  it('rejects aggregating an aggregate', () => {
    expect(fail('SUM(SUM([Sales]))').message).toContain('already aggregated')
  })
})

describe('calculated fields in the data model', () => {
  const sheet = (calcs: { name: string; formula: string }[]) => ({ source: 'sessions' as const, calcs })
  it('makes number calcs measures, others dimensions, aggregate calcs AGG measures', () => {
    const s = sheet([
      { name: 'Hours', formula: '[Minutes Watched] / 60' },
      { name: 'Device Upper', formula: 'UPPER([Device])' },
      { name: 'Per Session', formula: 'SUM([Minutes Watched]) / COUNT([Session ID])' },
      { name: 'Hours x2', formula: '[Hours] * 2' },
    ])
    expect(fieldOf(s, 'Hours')).toMatchObject({ role: 'measure', agg: 'sum', type: 'number' })
    expect(fieldOf(s, 'Device Upper')).toMatchObject({ role: 'dimension', type: 'string' })
    expect(resolvePill(s, { field: 'Per Session' })).toMatchObject({ kind: 'measure', label: 'AGG(Per Session)', continuous: true })
    expect(resolvePill(s, { field: 'Hours x2' }).label).toBe('SUM(Hours x2)')
  })
  it('keeps broken calcs with their error, and pills on them fail', () => {
    const s = sheet([
      { name: 'Bad', formula: 'SUM([Minutes Watched]) / [Minutes Watched]' },
      { name: 'Counted', formula: '[Sessions (Count)] * 2' },
      { name: 'Device', formula: '1' },
      { name: 'Early', formula: '[Late]' },
      { name: 'Late', formula: '1' },
    ])
    const [bad, counted, dup, early] = calcFields({ source: 'sessions' }, s.calcs)
    expect(bad!.calc!.error!.message).toBe(MIX_MESSAGE)
    expect(counted!.calc!.error!.message).toContain('COUNTD([Session ID])')
    expect(dup!.calc!.error!.message).toContain('already a field')
    expect(early!.calc!.error!.message).toContain('defined after')
    expect(() => resolvePill(s, { field: 'Bad' })).toThrow(EngineError)
  })
})

describe('calculated fields in queries', () => {
  const data = testDataset()
  const ref = referenceData()
  const spec = (s: unknown): VizSpec => vizSpecSchema.parse(s)
  const calcs = [
    { name: 'Hours', formula: '[Minutes Watched] / 60' },
    { name: 'Long', formula: "IIF([Minutes Watched] >= 60, 'Long', 'Short')" },
    { name: 'Per Session', formula: 'SUM([Minutes Watched]) / COUNT([Session ID])' },
    { name: 'Start Year', formula: "DATENAME('year', [Start])" },
  ]

  it('sums a row-level calc per member, as a plain reduce does', () => {
    const v = spec({ calcs, rows: [{ field: 'Genre' }], columns: [{ field: 'Hours' }] })
    const result = query(v, data)
    const g = columnOf(result, v, { field: 'Genre' })
    const h = columnOf(result, v, { field: 'Hours' })
    const expected: Record<string, number> = {}
    for (const s of ref.sessions) expected[s.title.genre] = (expected[s.title.genre] ?? 0) + (s.minutes ?? 0) / 60
    for (const r of result.rows) expect(r[h.id]).toBeCloseTo(expected[r[g.id] as string]!, 6)
  })

  it('evaluates an aggregate calc per mark, not row by row', () => {
    const v = spec({ calcs, rows: [{ field: 'Device' }], columns: [{ field: 'Per Session' }] })
    const result = query(v, data)
    const d = columnOf(result, v, { field: 'Device' })
    const p = columnOf(result, v, { field: 'Per Session' })
    for (const r of result.rows) {
      const rows = ref.sessions.filter((s) => (s.device || 'Null') === r[d.id])
      const total = rows.reduce((a, s) => a + (s.minutes ?? 0), 0)
      expect(r[p.id]).toBeCloseTo(total / rows.length, 9)
    }
  })

  it('uses calcs as dimensions, filters and sorts', () => {
    const v = spec({
      calcs,
      rows: [{ field: 'Long', sort: { order: 'desc', field: 'Per Session' } }],
      columns: [{ field: 'Sessions (Count)' }],
      filters: [{ kind: 'values', field: 'Start Year', values: ['2025'] }, { kind: 'range', field: 'Per Session', min: 0 }],
    })
    const result = query(v, data)
    const l = columnOf(result, v, { field: 'Long' })
    const c = columnOf(result, v, { field: 'Sessions (Count)' })
    const in2025 = ref.sessions.filter((s) => s.start.startsWith('2025'))
    const long = in2025.filter((s) => s.minutes !== null && s.minutes >= 60).length
    const nulls = in2025.filter((s) => s.minutes === null).length
    // The Null member (sessions without minutes) has no Per Session value, so the measure filter drops it.
    expect(nulls).toBeGreaterThan(0)
    expect(Object.fromEntries(result.rows.map((r) => [r[l.id], r[c.id]]))).toEqual({ Long: long, Short: in2025.length - long - nulls })
    expect(l.order![0]).toBe('Long') // the longest sessions sort first
  })
})
