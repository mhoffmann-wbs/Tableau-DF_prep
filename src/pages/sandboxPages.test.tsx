// @vitest-environment jsdom
// The sandbox and its challenges, driven through the field and pill menus (the
// keyboard and touch path; drag and drop uses the same spec edits). The lazy
// runtime is mocked: jsdom can't fetch the dataset or draw with Vega.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../app/routes'
import { parseSpecHash } from '../engine/edit'
import type { MarkMembers } from '../engine/runtime'
import { getProgress, resetProgress } from '../progress/store'

/** The last chart's click handler: clicking a mark in jsdom means calling it. */
const view = vi.hoisted(() => ({ onMark: undefined as ((m: MarkMembers, additive: boolean) => void) | undefined }))

vi.mock('../engine/runtime', () => ({
  renderViz: async (_el: unknown, _spec: unknown, _theme: unknown, onMark?: (m: MarkMembers, additive: boolean) => void) => {
    view.onMark = onMark
    return () => {}
  },
  membersOf: async () => ['Console', 'Mobile', 'TV', 'Null'].map((m) => ({ label: m, value: m })),
}))

async function renderAt(path: string, heading: string | RegExp) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  // The first lazy load of the sandbox chunk can take a while.
  await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 })
  return router
}

const user = userEvent.setup()
const shelf = (name: string) => screen.getByRole('group', { name: `${name} shelf` })

/** Opens a field in the Data pane and picks a menu item. */
async function addField(field: string | RegExp, item: string) {
  await user.click(within(screen.getByRole('complementary', { name: 'Data pane' })).getByRole('button', { name: field }))
  await user.click(screen.getByRole('menuitem', { name: item }))
}

/** Opens a field in the Data pane and picks a checkable menu item (data type, aggregation…). */
async function setField(field: string | RegExp, item: string) {
  await user.click(within(screen.getByRole('complementary', { name: 'Data pane' })).getByRole('button', { name: field }))
  await user.click(screen.getByRole('menuitemradio', { name: item }))
}

/** Opens the pill on a shelf and picks a menu item. */
async function pillMenu(shelfName: string, pill: RegExp, item: string) {
  await user.click(within(shelf(shelfName)).getByRole('button', { name: pill }))
  await user.click(screen.getByRole('menuitem', { name: item }))
}

beforeEach(() => {
  localStorage.clear()
  resetProgress()
})

describe('sandbox', () => {
  it('adds fields, changes pills, keeps the spec in the URL and undoes', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    expect(screen.getByText(/Drag fields from the Data pane/)).toBeInTheDocument()
    await addField('Genre', 'Add to Rows')
    await addField('Minutes Watched', 'Add to Columns')
    expect(shelf('Rows')).toHaveTextContent('Genre (discrete)')
    expect(shelf('Columns')).toHaveTextContent('SUM(Minutes Watched) (continuous)')
    expect(screen.getByRole('combobox', { name: 'Mark type' })).toHaveDisplayValue('Automatic (Bar)')
    expect(screen.getByRole('figure', { name: 'Your view' })).toBeInTheDocument()

    await user.click(within(shelf('Columns')).getByRole('button', { name: /SUM\(Minutes Watched\)/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /Average/ }))
    expect(shelf('Columns')).toHaveTextContent('AVG(Minutes Watched)')
    expect(parseSpecHash(router.state.location.hash)).toMatchObject({ columns: [{ field: 'Minutes Watched', agg: 'avg' }], rows: [{ field: 'Genre' }] })

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(shelf('Columns')).toHaveTextContent('SUM(Minutes Watched)')

    // A pill can move to another shelf from its menu.
    await pillMenu('Rows', /^Genre/, 'Color')
    expect(shelf('Rows')).not.toHaveTextContent('Genre')
    expect(shelf('Color')).toHaveTextContent('Genre')
  })

  it('switches a date between parts and values', async () => {
    await renderAt('/build/sandbox', 'Viz builder sandbox')
    await addField('Start', 'Add to Columns')
    expect(shelf('Columns')).toHaveTextContent('YEAR(Start) (discrete)')
    await user.click(within(shelf('Columns')).getByRole('button', { name: /YEAR\(Start\)/ }))
    const months = within(screen.getByRole('menu')).getAllByRole('menuitemradio', { name: /Month/ })
    expect(months).toHaveLength(2)
    await user.click(months[1]!)
    expect(shelf('Columns')).toHaveTextContent('MONTH(Start) (continuous)')
  })

  it('filters by members and sorts by a measure', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    await addField('Genre', 'Add to Rows')
    await addField('Device', 'Add to Filters…')
    const dialog = screen.getByRole('region', { name: 'Filter Device' })
    expect(within(dialog).getByRole('button', { name: 'Apply filter' })).toBeDisabled()
    await user.click(await within(dialog).findByRole('checkbox', { name: 'TV' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply filter' }))
    expect(shelf('Filters')).toHaveTextContent('Device')

    await pillMenu('Rows', /^Genre/, 'Sort…')
    const sort = screen.getByRole('region', { name: 'Sort Genre' })
    await user.selectOptions(within(sort).getByRole('combobox', { name: 'Sort by' }), 'field')
    await user.selectOptions(within(sort).getByRole('combobox', { name: 'Sort order' }), 'desc')
    await user.click(within(sort).getByRole('button', { name: 'Apply sort' }))
    expect(parseSpecHash(router.state.location.hash)).toMatchObject({
      rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched', agg: 'sum' } }],
      filters: [{ kind: 'values', field: 'Device', values: ['TV'] }],
    })
  })

  it('changes fields in the Data pane: rename, aliases, type, aggregation, manual sort', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    const hash = () => parseSpecHash(router.state.location.hash)
    await addField('Device', 'Add to Rows')

    await addField('Device', 'Rename…')
    const rename = screen.getByRole('region', { name: 'Rename Device' })
    await user.clear(within(rename).getByRole('textbox', { name: 'Name' }))
    await user.type(within(rename).getByRole('textbox', { name: 'Name' }), 'Genre')
    await user.click(within(rename).getByRole('button', { name: 'OK' }))
    expect(within(rename).getByRole('alert')).toHaveTextContent('already a field called Genre')
    await user.clear(within(rename).getByRole('textbox', { name: 'Name' }))
    await user.type(within(rename).getByRole('textbox', { name: 'Name' }), 'Screen{Enter}')
    expect(shelf('Rows')).toHaveTextContent('Screen')
    expect(hash()).toMatchObject({ rows: [{ field: 'Screen' }], fields: [{ field: 'Device', name: 'Screen' }] })

    await addField('Screen', 'Aliases…')
    const aliases = screen.getByRole('region', { name: 'Edit Aliases [Screen]' })
    const tv = await within(aliases).findByRole('textbox', { name: 'Alias for TV' })
    await user.clear(tv)
    await user.type(tv, 'Television')
    await user.click(within(aliases).getByRole('button', { name: 'OK' }))
    expect(hash()).toMatchObject({ fields: [{ field: 'Device', name: 'Screen', aliases: { TV: 'Television' } }] })

    await pillMenu('Rows', /^Screen/, 'Sort…')
    const sort = screen.getByRole('region', { name: 'Sort Screen' })
    await user.selectOptions(within(sort).getByRole('combobox', { name: 'Sort by' }), 'manual')
    await user.click(await within(sort).findByRole('button', { name: 'Move TV up' }))
    await user.click(within(sort).getByRole('button', { name: 'Apply sort' }))
    expect(hash()).toMatchObject({ rows: [{ field: 'Screen', sort: { manual: ['Console', 'TV', 'Mobile', 'Null'] } }] })

    await setField('Minutes Watched', 'Aggregation: Average')
    await addField('Minutes Watched', 'Add to Columns')
    expect(shelf('Columns')).toHaveTextContent('AVG(Minutes Watched)')

    await setField('Release Year', 'String')
    expect(hash()).toMatchObject({ fields: [{ field: 'Device' }, { field: 'Minutes Watched', agg: 'avg' }, { field: 'Release Year', type: 'string' }] })
    await addField('Release Year', 'Undo all changes to this field')
    expect(hash()).toMatchObject({ fields: [{ field: 'Device' }, { field: 'Minutes Watched' }] })
    expect(router.state.location.hash).not.toContain('Release')
  })

  it('creates groups, sets, bins and hierarchies, and drills down', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    const hash = () => parseSpecHash(router.state.location.hash)

    await addField('Device', 'Group…')
    const group = screen.getByRole('region', { name: 'Create Group [Device]' })
    await user.click(await within(group).findByRole('checkbox', { name: 'Console' }))
    await user.click(within(group).getByRole('checkbox', { name: 'TV' }))
    await user.click(within(group).getByRole('button', { name: 'Group' }))
    expect(within(group).queryByRole('checkbox', { name: 'TV' })).not.toBeInTheDocument()
    await user.clear(within(group).getByRole('textbox', { name: 'Group name 1' }))
    await user.type(within(group).getByRole('textbox', { name: 'Group name 1' }), 'Big screen')
    await user.click(within(group).getByRole('checkbox', { name: 'Include ‘Other’' }))
    await user.click(within(group).getByRole('button', { name: 'OK' }))
    expect(hash()).toMatchObject({ groups: [{ name: 'Device (group)', field: 'Device', groups: [{ name: 'Big screen', members: ['Console', 'TV'] }], other: true }] })
    await addField(/Device \(group\)/, 'Add to Rows')
    expect(shelf('Rows')).toHaveTextContent('Device (group)')

    await addField(/^Device$/, 'Set…')
    const set = screen.getByRole('region', { name: 'Create Set [Device]' })
    await user.click(within(set).getByRole('tab', { name: 'Top' }))
    await user.clear(within(set).getByRole('spinbutton', { name: 'How many' }))
    await user.type(within(set).getByRole('spinbutton', { name: 'How many' }), '2')
    await user.click(within(set).getByRole('button', { name: 'OK' }))
    expect(hash()).toMatchObject({ sets: [{ name: 'Device Set', rule: { kind: 'top', from: 'top', n: 2, field: 'Minutes Watched', agg: 'sum' } }] })
    await addField(/Device Set/, 'Add to Columns')
    await user.click(within(shelf('Columns')).getByRole('button', { name: /Device Set/ }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Show Members in Set' }))
    expect(hash()).toMatchObject({ columns: [{ field: 'Device Set', setView: 'members' }] })

    await addField('Minutes Watched', 'Bins…')
    const bins = screen.getByRole('region', { name: 'Create Bins [Minutes Watched]' })
    await user.clear(within(bins).getByRole('spinbutton', { name: 'Size of bins' }))
    await user.type(within(bins).getByRole('spinbutton', { name: 'Size of bins' }), '15')
    await user.click(within(bins).getByRole('button', { name: 'OK' }))
    expect(hash()).toMatchObject({ bins: [{ name: 'Minutes Watched (bin)', field: 'Minutes Watched', size: 15 }] })
    expect(within(screen.getByRole('complementary', { name: 'Data pane' })).getByRole('button', { name: /Minutes Watched \(bin\)\s*\(bin\)/ })).toBeInTheDocument()

    await addField(/^Type$/, 'Create Hierarchy…')
    await user.click(within(screen.getByRole('region', { name: 'Create Hierarchy' })).getByRole('button', { name: 'OK' }))
    await addField(/^Genre$/, 'Add to Hierarchy Type Hierarchy')
    expect(hash()).toMatchObject({ hierarchies: [{ name: 'Type Hierarchy', fields: ['Type', 'Genre'] }] })
    expect(screen.getByRole('list', { name: 'Type Hierarchy levels' })).toHaveTextContent(/Type.*Genre/)

    await addField(/^Type$/, 'Add to Detail')
    await user.click(screen.getByRole('button', { name: 'Drill down from Type to Genre' }))
    expect(hash()).toMatchObject({ marks: { detail: [{ field: 'Type' }, { field: 'Genre' }] } })
    await user.click(screen.getByRole('button', { name: 'Drill up: collapse Type' }))
    expect(hash()).toMatchObject({ marks: { detail: [{ field: 'Type' }] } })
  })

  it('groups marks and makes a fixed set from them', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    await addField('Device', 'Add to Rows')
    await addField('Genre', 'Add to Columns')
    await waitFor(() => expect(view.onMark).toBeDefined())
    const click = (device: string, genre: string, additive = false) => act(() => view.onMark!([{ field: 'Device', member: device }, { field: 'Genre', member: genre }], additive))

    click('TV', 'Drama')
    click('Console', 'Comedy', true)
    const bar = screen.getByRole('region', { name: 'Selected marks' })
    expect(bar).toHaveTextContent('2 marks selected: TV, Console')
    await user.selectOptions(within(bar).getByRole('combobox'), 'Genre')
    expect(bar).toHaveTextContent('Drama, Comedy')
    await user.selectOptions(within(bar).getByRole('combobox'), 'Device')

    await user.click(within(bar).getByRole('button', { name: /Group/ }))
    const group = screen.getByRole('region', { name: 'Create Group [Device]' })
    expect(within(group).getByRole('textbox', { name: 'Group name 1' })).toHaveValue('TV, Console')
    await user.click(within(group).getByRole('button', { name: 'OK' }))
    expect(parseSpecHash(router.state.location.hash)).toMatchObject({ groups: [{ name: 'Device (group)', field: 'Device', groups: [{ name: 'TV, Console', members: ['TV', 'Console'] }] }] })
    // The chart changed (a new field in the Data pane), so the selection starts over.
    expect(screen.queryByRole('region', { name: 'Selected marks' })).not.toBeInTheDocument()

    click('Mobile', 'Drama')
    await user.click(within(screen.getByRole('region', { name: 'Selected marks' })).getByRole('button', { name: 'Create Set…' }))
    await user.click(within(screen.getByRole('region', { name: 'Create Set [Device]' })).getByRole('button', { name: 'OK' }))
    expect(parseSpecHash(router.state.location.hash)).toMatchObject({ sets: [{ name: 'Device Set', field: 'Device', fixed: true, rule: { kind: 'members', members: ['Mobile'] } }] })
    click('Mobile', 'Drama')
    act(() => view.onMark!([], false))
    expect(screen.queryByRole('region', { name: 'Selected marks' })).not.toBeInTheDocument()
  })

  it('combines measures on one axis, and makes a dual axis with a mark per measure', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    const hash = () => parseSpecHash(router.state.location.hash)
    await addField('Genre', 'Add to Columns')
    await addField('Minutes Watched', 'Add to Rows')
    await addField('Runtime', 'Drop on the Rows axis')
    expect(shelf('Rows')).toHaveTextContent('Measure Values')
    expect(shelf('Color')).toHaveTextContent('Measure Names')
    expect(shelf('Measure Values')).toHaveTextContent(/SUM\(Minutes Watched\).*SUM\(Runtime\)/)

    await user.click(screen.getByRole('button', { name: 'Clear sheet' }))
    await addField('Genre', 'Add to Columns')
    await addField('Minutes Watched', 'Add to Rows')
    await addField('Sessions (Count)', 'Add to Rows')
    await user.click(within(shelf('Rows')).getByRole('button', { name: /SUM\(Sessions \(Count\)\)/ }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Dual Axis' }))
    expect(hash()).toMatchObject({ axes: { rows: { dual: true } } })
    await user.click(within(shelf('Rows')).getByRole('button', { name: /SUM\(Sessions \(Count\)\)/ }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Synchronize Axis' }))
    expect(hash()).toMatchObject({ axes: { rows: { dual: true, sync: true } } })

    await user.click(screen.getByRole('tab', { name: 'SUM(Sessions (Count))' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mark type for SUM(Sessions (Count))' }), 'line')
    expect(hash()).toMatchObject({ rows: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)', mark: 'line' }] })
    await user.click(screen.getByRole('tab', { name: 'All' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mark type' }), 'bar')
    expect(hash()).toMatchObject({ marks: { type: 'bar' }, rows: [{ field: 'Minutes Watched' }, { field: 'Sessions (Count)' }] })
  })

  it('opens a preset from the URL', async () => {
    await renderAt(`/build/sandbox#spec=${encodeURIComponent('{"source":"titles","rows":[{"field":"Genre"}]}')}`, 'Viz builder sandbox')
    expect(screen.getByRole('combobox', { name: 'Data source' })).toHaveDisplayValue('Titles')
    expect(shelf('Rows')).toHaveTextContent('Genre')
  })

  it('reports a damaged preset', async () => {
    await renderAt('/build/sandbox#spec=%7Bnope', 'Viz builder sandbox')
    expect(screen.getByRole('alert')).toHaveTextContent('damaged')
  })
})

describe('make this chart', () => {
  it('checks the chart, hints at the difference and records the solve', async () => {
    await renderAt('/build/sandbox/avg-minutes-by-plan', 'Aggregation: average session length by plan')
    expect(screen.getByRole('figure', { name: 'Target chart' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Data source' })).toBeDisabled()
    await addField('Plan', 'Add to Rows')
    await addField('Minutes Watched', 'Add to Columns')
    await user.click(screen.getByRole('button', { name: 'Check my chart' }))
    expect(screen.getByRole('status')).toHaveTextContent('Columns: SUM(Minutes Watched) needs a different aggregation.')

    await user.click(within(shelf('Columns')).getByRole('button', { name: /SUM\(Minutes Watched\)/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /Average/ }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Check my chart' }))
    expect(screen.getByRole('status')).toHaveTextContent('That’s the target chart.')
    expect(getProgress().sandbox['avg-minutes-by-plan']).toBeTypeOf('number')
    expect(screen.getByRole('link', { name: /Next challenge/ })).toHaveAttribute('href', '/build/sandbox/subscribers-by-region')
  })

  it('lists the challenges with their solved state', async () => {
    await renderAt('/build', 'Build')
    expect(screen.getByText(/0 of 15 solved/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1. Bar chart: minutes by genre' })).toHaveAttribute('href', '/build/sandbox/bar-genre-minutes')
  })

  it('says when a challenge does not exist', async () => {
    await renderAt('/build/sandbox/nope', 'Challenge not found')
    expect(screen.getByRole('link', { name: 'All challenges' })).toHaveAttribute('href', '/build')
  })
})

describe('calculated fields in the sandbox', () => {
  it('creates a calc from the Data pane, uses it on a shelf and saves it', async () => {
    const router = await renderAt('/build/sandbox', 'Viz builder sandbox')
    const pane = () => within(screen.getByRole('complementary', { name: 'Data pane' }))
    await user.click(pane().getByRole('button', { name: 'Calculated field…' }))
    await user.click(screen.getByRole('menuitem', { name: 'Create calculated field…' }))
    const dialog = within(screen.getByRole('region', { name: 'Create calculated field' }))
    await user.clear(dialog.getByRole('textbox', { name: 'Name' }))
    await user.type(dialog.getByRole('textbox', { name: 'Name' }), 'Hours')

    await user.click(dialog.getByRole('textbox', { name: 'Formula' }))
    await user.paste('[Minutes Watched] / COUNT([Session ID])')
    expect(dialog.getByText('Cannot mix aggregate and non-aggregate arguments with this function.')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Add to Data pane' })).toBeDisabled()

    await user.clear(dialog.getByRole('textbox', { name: 'Formula' }))
    await user.paste('[Minutes Watched] / 60')
    expect(dialog.getByText(/It becomes a measure, aggregated as SUM/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Add to Data pane' }))

    await addField(/^Hours.*calculated field/, 'Add to Columns')
    expect(shelf('Columns')).toHaveTextContent('SUM(Hours)')
    expect(parseSpecHash(router.state.location.hash)).toMatchObject({ calcs: [{ name: 'Hours', formula: '[Minutes Watched] / 60' }], columns: [{ field: 'Hours' }] })
    expect(getProgress().calcs).toMatchObject([{ source: 'sessions', name: 'Hours', formula: '[Minutes Watched] / 60' }])

    await addField(/^Hours.*calculated field/, 'Remove from sheet, with its pills')
    expect(shelf('Columns')).not.toHaveTextContent('Hours')
    // A saved calc can come back into the sheet.
    await user.click(pane().getByRole('button', { name: 'Calculated field…' }))
    await user.click(screen.getByRole('menuitem', { name: 'Add Hours' }))
    expect(pane().getByRole('button', { name: /^Hours.*calculated field/ })).toBeInTheDocument()
  })
})

