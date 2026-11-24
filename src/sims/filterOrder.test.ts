// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import sim from '../content/sims/filter-order.json'
import FilterOrder, { COPY_KEYS, COUNTRY, DEFAULTS, ROWS, type Settings, TOP_N, runPipeline, topTitles } from './FilterOrder'

afterEach(cleanup)

const settings = (over: Partial<Settings['on']>, ctx: Partial<Settings['context']> = {}): Settings => ({
  on: { extract: false, source: false, country: false, date: false, top: false, measure: false, ...over },
  context: { country: false, date: false, ...ctx },
})
const titles = (s: Settings) => runPipeline(s).marks.map((m) => m.title).sort()

describe('runPipeline', () => {
  it('keeps every row with no filter', () => {
    const r = runPipeline(settings({}))
    expect(r.marks).toHaveLength(new Set(ROWS.map((x) => x.title)).size)
    expect(Object.values(r.removedAt).every((x) => x === null)).toBe(true)
  })

  it('Top N without context ignores Country; with context it works inside the country', () => {
    // independent computation
    const sums: Record<string, number> = {}
    for (const r of ROWS) sums[r.title] = (sums[r.title] ?? 0) + r.minutes
    const rank = (names: string[], s: Record<string, number>) => [...names].sort((a, b) => s[b]! - s[a]!).slice(0, TOP_N)
    const topAll = rank(Object.keys(sums), sums)
    const withoutExpected = topAll.filter((t) => ROWS.some((r) => r.title === t && r.country === COUNTRY)).sort()

    const de: Record<string, number> = {}
    for (const r of ROWS.filter((x) => x.country === COUNTRY)) de[r.title] = (de[r.title] ?? 0) + r.minutes
    const withExpected = rank(Object.keys(de), de).sort()

    const without = titles(settings({ country: true, top: true }))
    const withCtx = titles(settings({ country: true, top: true }, { country: true }))
    expect(without).toEqual(withoutExpected)
    expect(withCtx).toEqual(withExpected)
    expect(without).not.toEqual(withCtx)
    expect(withCtx).toHaveLength(TOP_N)
    expect(without.length).toBeLessThan(TOP_N)
  })

  it('reports the Top N pick and where rows are removed', () => {
    const without = runPipeline(settings({ country: true, top: true }))
    expect(without.topPicked).toEqual(topTitles(ROWS))
    expect(without.stages.find((s) => s.key === 'dimension')!.before).toBe(ROWS.length)
    const withCtx = runPipeline(settings({ country: true, top: true }, { country: true }))
    expect(withCtx.stages.find((s) => s.key === 'context')!.after).toBe(ROWS.filter((r) => r.country === COUNTRY).length)
    expect(withCtx.removedAt[1]).toBe('context')
  })

  it('applies extract and data source filters before the Top N', () => {
    const r = runPipeline(settings({ extract: true, source: true, top: true }))
    expect(r.topPicked).toEqual(topTitles(ROWS.filter((x) => x.device !== 'Web' && x.genre !== 'Documentary')))
    expect(r.removedAt[10]).toBe('extract')
    expect(r.removedAt[7]).toBe('source')
  })

  it('applies the measure filter to the summed marks after the dimension filters', () => {
    const r = runPipeline(settings({ country: true, measure: true }))
    expect(r.marks.every((m) => m.minutes >= 100)).toBe(true)
    expect(r.marks.map((m) => m.title).sort()).toEqual(['Quiet Fox', 'Slow Tides'])
  })

  it('a date filter keeps the range, in context or not', () => {
    const plain = titles(settings({ date: true }))
    expect(plain).toEqual(titles(settings({ date: true }, { date: true })))
    const r = runPipeline(settings({ date: true }))
    for (const row of ROWS) expect(r.removedAt[row.id] === null).toBe(row.date >= '2025-01-01' && row.date <= '2025-03-31')
  })

  it('date filter in context changes a Top N the same way', () => {
    const a = runPipeline(settings({ date: true, top: true }))
    const b = runPipeline(settings({ date: true, top: true }, { date: true }))
    expect(b.topPicked).toEqual(topTitles(ROWS.filter((r) => r.date <= '2025-03-31')))
    expect(a.topPicked).toEqual(topTitles(ROWS))
  })
})

describe('FilterOrder', () => {
  it('has copy for exactly its keys', () => {
    expect(Object.keys(sim.copy).sort()).toEqual([...COPY_KEYS].sort())
  })

  it('shows different marks when Country is added to context', () => {
    expect(DEFAULTS.on.top && DEFAULTS.on.country).toBe(true)
    render(createElement(FilterOrder, { copy: sim.copy }))
    const view = () => within(screen.getByRole('table', { name: /The view/ })).getAllByRole('row').length - 1
    expect(view()).toBe(2)
    const group = screen.getByRole('group', { name: /Dimension filter on Country runs as/ })
    fireEvent.click(within(group).getByRole('button', { name: 'Add to Context' }))
    expect(view()).toBe(TOP_N)
    expect(screen.getByText(/Country is in context/)).toBeTruthy()
  })
})
