import { describe, expect, it } from 'vitest'
import { testDataset } from '../test/dataset'
import { emptySpec, specHash } from './edit'
import {
  actionFields,
  actionFilters,
  emptyWorkbook,
  type FilterAction,
  filteredSheet,
  nextActionState,
  parseWorkbookHash,
  toggleUseAsFilter,
  viewDimensions,
  type Workbook,
  workbookHash,
  workbookSchema,
} from './dashboard'
import { columnOf, query } from './query'
import { vizSpecSchema } from './spec'

const byGenre = vizSpecSchema.parse({ rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }] })
const byDevice = vizSpecSchema.parse({ rows: [{ field: 'Device' }, { field: 'Genre' }], columns: [{ field: 'Sessions (Count)' }] })
const workbook: Workbook = workbookSchema.parse({ sheets: [byGenre, byDevice], dashboard: { actions: [{ name: 'Filter 1', source: 0, target: 1 }] } })
const action = workbook.dashboard.actions[0]!
const comedy = [{ field: 'Genre', member: 'Comedy' }]
const drama = [{ field: 'Genre', member: 'Drama' }]

describe('filter actions', () => {
  it('filter the target to the selected marks and apply the clearing option', () => {
    const state = nextActionState(action, [comedy, drama], undefined)
    expect(actionFilters(action, state, byGenre, byDevice)).toEqual([{ kind: 'values', field: 'Genre', values: ['Comedy', 'Drama'] }])
    const clearedWith = (clearing: FilterAction['clearing']) => nextActionState({ ...action, clearing }, [], state)
    expect(clearedWith('leave')).toBe(state)
    expect(clearedWith('all')).toBeUndefined()
    expect(clearedWith('exclude')).toEqual({ kind: 'exclude' })
    expect(actionFilters(action, { kind: 'exclude' }, byGenre, byDevice)).toBe('excluded')
    // A click on the background reports a mark without members: that clears.
    expect(nextActionState(action, [[]], state)).toBeUndefined()
  })

  it('filter only on fields the target’s data source has, limited to Selected fields', () => {
    const titles = vizSpecSchema.parse({ source: 'titles', rows: [{ field: 'Genre' }] })
    const subscribers = vizSpecSchema.parse({ source: 'subscribers', rows: [{ field: 'Plan' }] })
    expect(actionFields(action, byDevice, titles)).toEqual(['Genre'])
    expect(actionFields(action, byDevice, subscribers)).toEqual([])
    expect(actionFields({ ...action, fields: ['Device'] }, byDevice, byGenre)).toEqual(['Device'])
  })

  it('report the view’s discrete, non-date dimensions as the fields a mark carries', () => {
    const spec = vizSpecSchema.parse({
      columns: [{ field: 'Start' }],
      rows: [{ field: 'Device' }, { field: 'Minutes Watched' }],
      marks: { color: { field: 'Genre' }, detail: [{ field: 'Title' }], tooltip: [{ field: 'Plan' }] },
    })
    expect(viewDimensions(spec)).toEqual(['Device', 'Genre', 'Title'])
  })

  it('draw the target with the action’s filters over the data', () => {
    const states = [nextActionState(action, [comedy], undefined)]
    const target = filteredSheet(workbook, 1, states)
    if (target === 'excluded') throw new Error('expected a sheet')
    const result = query(target, testDataset())
    const genre = columnOf(result, target, { field: 'Genre' })
    expect(new Set(result.rows.map((r) => r[genre.id]))).toEqual(new Set(['Comedy']))
    expect(filteredSheet(workbook, 0, states)).toBe(workbook.sheets[0])
    expect(filteredSheet(workbook, 1, [{ kind: 'exclude' }])).toBe('excluded')
  })

  it('come from Use as Filter, which toggles a select action to the other sheet', () => {
    const on = toggleUseAsFilter(emptyWorkbook(byGenre), 0)
    expect(on.dashboard.actions).toEqual([{ name: 'Filter from Sheet 1', source: 0, target: 1, run: 'select', clearing: 'all', useAsFilter: true }])
    expect(toggleUseAsFilter(on, 0).dashboard.actions).toEqual([])
  })

  it('need different source and target sheets', () => {
    expect(workbookSchema.safeParse({ sheets: [byGenre, byDevice], dashboard: { actions: [{ name: 'x', source: 1, target: 1 }] } }).success).toBe(false)
  })
})

describe('workbook hash', () => {
  it('stays a #spec= link while only Sheet 1 is used', () => {
    expect(workbookHash(emptyWorkbook(byGenre))).toBe(specHash(byGenre))
  })

  it('round-trips both sheets and the dashboard as #wb=', () => {
    const hash = workbookHash(workbook)
    expect(hash).toMatch(/^#wb=/)
    expect(parseWorkbookHash(hash)).toEqual(workbook)
    expect(parseWorkbookHash(workbookHash({ ...emptyWorkbook(byGenre), sheets: [byGenre, emptySpec('titles')] }))).toMatchObject({ sheets: [{}, { source: 'titles' }] })
    expect(parseWorkbookHash('#wb=%7Bnope')).toBeInstanceOf(Error)
    expect(parseWorkbookHash('#spec=x')).toBeUndefined()
  })
})
