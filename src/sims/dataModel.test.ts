// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SIM_BY_ID } from '../content/sims'
import DataModel, { COPY_KEYS, combine, joinRows, PLANS, SESSIONS_2024, statusOf } from './DataModel'

afterEach(cleanup)

// Independent expectations, computed by hand from the sample tables:
// Plans Basic 10, Standard 15, Premium 20, Family 25 (no sessions);
// Sessions Basic 30+45+20, Standard 60+40, Premium 90, Promo 25 (no plan).
describe('combine', () => {
  it('inner join: matched rows only, prices repeated per session', () => {
    const r = combine('inner')
    expect(r.rowCount).toBe(6)
    expect(r.price).toBe(10 * 3 + 15 * 2 + 20)
    expect(r.minutes).toBe(285)
  })
  it('left join keeps the plan without sessions', () => {
    const r = combine('left')
    expect(r.rowCount).toBe(7)
    expect(r.price).toBe(105)
    expect(r.minutes).toBe(285)
    expect(r.rows.filter((x) => x.flag === 'null')).toHaveLength(1)
    expect(r.rows.filter((x) => x.flag === 'repeat')).toHaveLength(3)
  })
  it('right join keeps the session without a plan', () => {
    const r = combine('right')
    expect(r.rowCount).toBe(7)
    expect(r.price).toBe(80)
    expect(r.minutes).toBe(310)
    expect(r.rows.map((x) => x.cells[2])).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7'])
  })
  it('full join keeps both unmatched rows', () => {
    const r = combine('full')
    expect(r.rowCount).toBe(8)
    expect(r.price).toBe(105)
    expect(r.minutes).toBe(310)
  })
  it('a join inflates the price, a relationship does not', () => {
    expect(statusOf(combine('left').price, combine('left').truePrice)).toBe('inflated')
    const rel = combine('relationship')
    expect(rel.rowCount).toBeNull()
    expect(rel.price).toBe(70)
    expect(rel.minutes).toBe(310)
    expect(statusOf(rel.price, rel.truePrice)).toBe('exact')
  })
  it('union stacks the rows and adds the minutes', () => {
    const r = combine('union')
    expect(r.rowCount).toBe(10)
    expect(r.minutes).toBe(310 + 35 + 50 + 25)
    expect(r.price).toBeNull()
    expect(statusOf(r.minutes, r.trueMinutes)).toBe('exact')
  })
  it('blend: primary rows kept, secondary aggregated, unmatched dropped', () => {
    const a = combine('blend', 'plans')
    expect(a.rowCount).toBe(4)
    expect(a.price).toBe(70)
    expect(a.minutes).toBe(285)
    const b = combine('blend', 'sessions')
    expect(b.rowCount).toBe(4)
    expect(b.price).toBe(45)
    expect(b.minutes).toBe(310)
  })
  it('sample data has one unmatched key on each side', () => {
    expect(PLANS.filter((p) => !SESSIONS_2024.some((s) => s.plan === p.plan))).toHaveLength(1)
    expect(SESSIONS_2024.filter((s) => !PLANS.some((p) => p.plan === s.plan))).toHaveLength(1)
    expect(joinRows('inner')).toHaveLength(6)
  })
})

describe('DataModel', () => {
  const copy = SIM_BY_ID.get('data-model')?.copy ?? Object.fromEntries(COPY_KEYS.map((k) => [k, k]))
  it('switches the result with the method', () => {
    render(createElement(DataModel, { copy }))
    expect(screen.getByText(/Rows:/).textContent).toContain('7')
    fireEvent.click(screen.getByRole('button', { name: 'Relationship' }))
    expect(screen.getByText(/Rows:/).textContent).toContain('no merged table')
    expect(screen.getByText(/SUM\(Monthly Price\):/).textContent).toContain('70')
    fireEvent.click(screen.getByRole('button', { name: 'Blend' }))
    expect(screen.getByRole('group', { name: 'Primary data source' })).toBeTruthy()
  })
})
