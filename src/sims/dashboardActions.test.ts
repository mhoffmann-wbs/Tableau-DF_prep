// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import sim from '../content/sims/dashboard-actions.json'
import DashboardActions, {
  ALL, DEFAULT_CONFIG, GENRES, ROWS, buildUrl, effectKey, genreTotals, nextHeld, parameterValue, reactsTo, sheetRows, targetView,
  type ActionConfig, type Held,
} from './DashboardActions'

const cfg = (p: Partial<ActionConfig>): ActionConfig => ({ ...DEFAULT_CONFIG, ...p })
const drama: Held = { kind: 'member', genre: 'Drama' }

describe('action logic', () => {
  it('filters the target to the selected member and removes the rest', () => {
    const rows = targetView(cfg({ type: 'filter' }), drama, ROWS)
    expect(rows.map((r) => r.row.genre)).toEqual(['Drama', 'Drama'])
    expect(rows.every((r) => !r.dimmed)).toBe(true)
  })
  it('highlight keeps every row and dims the others', () => {
    const rows = targetView(cfg({ type: 'highlight' }), drama, ROWS)
    expect(rows).toHaveLength(ROWS.length)
    expect(rows.filter((r) => !r.dimmed).every((r) => r.row.genre === 'Drama')).toBe(true)
    expect(rows.filter((r) => r.dimmed)).toHaveLength(ROWS.length - 2)
  })
  it('applies the clearing options of a filter action', () => {
    expect(nextHeld(cfg({ clear: 'leave' }), null, drama)).toEqual(drama)
    expect(nextHeld(cfg({ clear: 'all' }), null, drama)).toEqual(ALL)
    const ex = nextHeld(cfg({ clear: 'exclude' }), null, drama)
    expect(targetView(cfg({ clear: 'exclude' }), ex, ROWS)).toEqual([])
    expect(effectKey(cfg({}), null, ex)).toBe('effectFilterExcluded')
  })
  it('applies the clearing options of a parameter action', () => {
    const p = cfg({ type: 'parameter' })
    expect(parameterValue(nextHeld({ ...p, paramClear: 'keep' }, null, drama))).toBe('Drama')
    expect(parameterValue(nextHeld({ ...p, paramClear: 'set' }, null, drama))).toBe('All')
    expect(parameterValue(nextHeld(p, 'Comedy', ALL))).toBe('Comedy')
  })
  it('builds a URL only from a field that is in the view', () => {
    const u = cfg({ type: 'url', urlField: 'Genre Code' })
    expect(buildUrl(u, ALL)).toBeNull()
    expect(buildUrl(u, drama)).toEqual({ url: 'https://example.com/browse?q=', missing: true })
    expect(buildUrl({ ...u, codeOnDetail: true }, drama)).toEqual({ url: 'https://example.com/browse?q=DRM', missing: false })
    expect(buildUrl(cfg({ type: 'url' }), drama)?.url).toBe('https://example.com/browse?q=Drama')
  })
  it('reacts to events by Run action on', () => {
    expect(reactsTo('hover', 'hover')).toBe('select')
    expect(reactsTo('hover', 'unhover')).toBe('clear')
    expect(reactsTo('hover', 'click')).toBe('ignore')
    expect(reactsTo('select', 'click')).toBe('select')
    expect(reactsTo('select', 'hover')).toBe('ignore')
    expect(reactsTo('menu', 'click')).toBe('open-menu')
    expect(reactsTo('menu', 'menu-link')).toBe('select')
  })
  it('the filter card reaches the source sheet only when applied to all sheets', () => {
    const card = { show: true, plan: 'Basic' as const, scope: 'sheet' as const }
    expect(sheetRows('target', card)).toHaveLength(4)
    expect(sheetRows('source', card)).toHaveLength(ROWS.length)
    expect(sheetRows('source', { ...card, scope: 'dashboard' })).toHaveLength(4)
    expect(sheetRows('target', { ...card, show: false })).toHaveLength(ROWS.length)
    expect(genreTotals(ROWS).map((t) => t.genre)).toEqual([...GENRES])
  })
})

describe('DashboardActions', () => {
  it('a click on a bar filters the Titles sheet, and clearing shows all values', () => {
    render(createElement(DashboardActions, { copy: sim.copy }))
    const table = screen.getByRole('table', { name: 'Titles' })
    expect(within(table).getAllByRole('row')).toHaveLength(ROWS.length + 1)
    fireEvent.click(screen.getByRole('button', { name: /^Comedy, \d+ minutes$/ }))
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.textContent?.includes('Comedy'))).toBe(true)
    expect(screen.getByText(/Titles shows only Comedy/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(within(table).getAllByRole('row')).toHaveLength(ROWS.length + 1)
  })
  it('Menu needs the tooltip link', () => {
    render(createElement(DashboardActions, { copy: sim.copy }))
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: /^Drama, \d+ minutes$/ }))
    expect(within(screen.getByRole('table', { name: 'Titles' })).getAllByRole('row')).toHaveLength(ROWS.length + 1)
    fireEvent.click(screen.getByRole('menuitem'))
    expect(within(screen.getByRole('table', { name: 'Titles' })).getAllByRole('row')).toHaveLength(3)
  })
})
