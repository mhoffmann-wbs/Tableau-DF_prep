// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import LiveExtract, {
  COPY_KEYS,
  type ExtractOptions,
  SOURCE0,
  applyChanges,
  asStored,
  buildExtract,
  fileHolds,
  illustrativeTime,
  refreshExtract,
  runView,
  staleness,
  storedRows,
} from './LiveExtract'
import copyJson from '../content/sims/live-extract.json'

const base: ExtractOptions = { only2025: false, aggregate: false, refresh: 'full' }

/** Elements whose text is the copy as rendered: backtick spans become code, so the backticks go. */
const shown = (text: string) => screen.getAllByText((_, el) => el?.textContent === text.replaceAll('`', ''))

describe('extract model', () => {
  it('a filtered extract holds only the matching rows', () => {
    expect(buildExtract(SOURCE0, { ...base, only2025: true }).every((r) => r.year === 2025)).toBe(true)
    expect(buildExtract(SOURCE0, { ...base, only2025: true })).toHaveLength(8)
  })

  it('aggregating stores one row per visible dimension combination and keeps the total', () => {
    const rows = buildExtract(SOURCE0, base)
    const agg = storedRows(rows, true)
    expect(agg).toHaveLength(4)
    const total = (xs: { minutes: number }[]) => xs.reduce((s, r) => s + r.minutes, 0)
    expect(total(agg)).toBe(total(rows))
    expect(agg.reduce((s, r) => s + r.rows, 0)).toBe(rows.length)
  })

  it('the extract is a snapshot until refreshed', () => {
    const extract = buildExtract(SOURCE0, base)
    const source = applyChanges(1)
    expect(staleness(extract, source, base)).toEqual({ missing: 4, outdated: 1 })
  })

  it('a full refresh catches new and changed rows', () => {
    const source = applyChanges(2)
    const out = refreshExtract(buildExtract(SOURCE0, base), source, base)
    expect(staleness(out, source, base)).toEqual({ missing: 0, outdated: 0 })
  })

  it('an incremental refresh adds new rows but misses corrections', () => {
    const inc = { ...base, refresh: 'incremental' as const }
    const source = applyChanges(1)
    const out = refreshExtract(buildExtract(SOURCE0, inc), source, inc)
    expect(out).toHaveLength(source.length)
    expect(staleness(out, source, inc)).toEqual({ missing: 0, outdated: 1 })
  })

  it('incremental is ignored with aggregation (full refresh happens)', () => {
    const o = { ...base, aggregate: true, refresh: 'incremental' as const }
    const source = applyChanges(1)
    expect(staleness(refreshExtract(buildExtract(SOURCE0, o), source, o), source, o)).toEqual({ missing: 0, outdated: 0 })
  })

  it('the view matches between live and a current extract', () => {
    const source = applyChanges(1)
    expect(runView(storedRows(buildExtract(source, base), true))).toEqual(runView(asStored(source)))
  })

  it('illustrative time grows with rows and depends on the live source', () => {
    expect(illustrativeTime('live', 'slow', 10)).toBeGreaterThan(illustrativeTime('live', 'fast', 10))
    expect(illustrativeTime('extract', 'slow', 20)).toBeGreaterThan(illustrativeTime('extract', 'slow', 10))
  })
})

describe('file types', () => {
  it('only the packaged types and .hyper carry data', () => {
    expect(fileHolds('twb', 'extract', 'file').data).toBe(false)
    expect(fileHolds('tds', 'extract', 'file')).toEqual({ metadata: true, data: false })
    expect(fileHolds('tdsx', 'live', 'file').data).toBe(true)
    expect(fileHolds('hyper', 'live', 'file').data).toBe(false)
    expect(fileHolds('hyper', 'extract', 'server').data).toBe(true)
  })

  it('server data is packaged only when extracted', () => {
    expect(fileHolds('twbx', 'live', 'server').data).toBe(false)
    expect(fileHolds('twbx', 'extract', 'server').data).toBe(true)
  })
})

describe('copy and component', () => {
  it('copy matches the keys', () => {
    expect(Object.keys(copyJson.copy).sort()).toEqual([...COPY_KEYS].sort())
  })

  it('the explanation follows the controls', () => {
    render(createElement(LiveExtract, { copy: copyJson.copy }))
    expect(shown(copyJson.copy.extractWhat).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Add 4 rows/ }))
    expect(shown(copyJson.copy.extractStale).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Live' }))
    expect(shown(copyJson.copy.liveFresh).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Offline' }))
    expect(shown(copyJson.copy.liveOffline).length).toBeGreaterThan(0)
  })
})
