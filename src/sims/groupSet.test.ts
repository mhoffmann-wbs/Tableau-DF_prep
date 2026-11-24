// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SIM_BY_ID } from '../content/sims'
import GroupSet, { COPY_KEYS, KINDS, scenariosOf, score } from './GroupSet'

const sim = SIM_BY_ID.get('group-set')!

describe('Group, set or hierarchy?', () => {
  it('has exactly the copy keys', () => {
    expect(Object.keys(sim.copy).sort()).toEqual([...COPY_KEYS].sort())
  })

  const scenarios = scenariosOf(sim.copy)

  it('has valid answer keys covering every kind', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(8)
    for (const s of scenarios) expect(KINDS).toContain(s.answer)
    expect(new Set(scenarios.map((s) => s.answer))).toEqual(new Set(KINDS))
  })

  it('scores picks', () => {
    expect(score(scenarios, {})).toMatchObject({ answered: 0, correct: 0, finished: false })
    const all = Object.fromEntries(scenarios.map((s) => [s.id, s.answer]))
    expect(score(scenarios, all)).toMatchObject({ correct: scenarios.length, finished: true })
    const wrong = { ...all, 1: scenarios[0]!.answer === 'bin' ? 'set' : 'bin' } as typeof all
    expect(score(scenarios, wrong).correct).toBe(scenarios.length - 1)
  })

  it('answers a scenario and shows feedback', () => {
    render(createElement(GroupSet, { copy: sim.copy }))
    const first = scenarios[0]!
    expect(screen.getByText(first.text)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Parameter' }))
    expect(screen.getByText(first.why, { exact: false })).toBeTruthy()
    expect(screen.getByText(first.how, { exact: false })).toBeTruthy()
    expect(screen.getByRole('img')).toBeTruthy()
    expect(screen.getByText(/0 right of 1 answered/)).toBeTruthy()
  })
})
