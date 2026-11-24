// @vitest-environment jsdom
// The calc playground and its exercises. The data runtime is mocked (jsdom
// can't fetch the dataset); the editor's checks run for real, since they need
// no data. The check over the data itself is covered by content/calc.test.ts.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../app/routes'
import { parseSpecHash } from '../engine/edit'
import { getProgress, resetProgress } from '../progress/store'

const check = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; message?: string }>>()
vi.mock('../engine/calc/runtime', () => ({
  preview: async () => ({ headers: ['Session ID', 'Minutes Watched', 'Hours'], rows: [['24-000001', '15', '0.25']], total: 32000, nulls: 57 }),
  check: (...args: unknown[]) => check(...args),
}))

async function renderAt(path: string, heading: string | RegExp) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 })
  return router
}

const user = userEvent.setup()

/** Replaces the formula; paste, because typing treats [ as a key name. */
async function setFormula(text: string) {
  const box = screen.getByRole('textbox', { name: 'Formula' })
  await user.clear(box)
  await user.click(box)
  await user.paste(text)
}

beforeEach(() => {
  localStorage.clear()
  resetProgress()
  check.mockReset()
})

describe('calc playground', () => {
  it('reports errors as you type, previews a valid calc and saves it', async () => {
    const router = await renderAt('/build/calc', 'Calc playground')
    await setFormula('[Minutes Watched] / COUNT([Session ID])')
    expect(screen.getByText('Cannot mix aggregate and non-aggregate arguments with this function.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'aggregation (lesson 4.3)' })).toBeInTheDocument()

    await setFormula('[Minutes Wached] / 60')
    expect(screen.getByText(/There is no field \[Minutes Wached\]/)).toBeInTheDocument()
    expect(screen.getByText('[Minutes Wached]', { selector: 'mark' })).toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Hours')
    await setFormula('[Minutes Watched] / 60')
    expect(screen.getByText(/It becomes a measure, aggregated as SUM/)).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: '0.25' })).toBeInTheDocument()
    expect(screen.getByText(/57 rows give Null/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save calculation' }))
    expect(getProgress().calcs).toMatchObject([{ source: 'sessions', name: 'Hours', formula: '[Minutes Watched] / 60' }])
    expect(screen.getByRole('heading', { name: 'Saved calculations (Sessions)' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Open in sandbox' }))
    await screen.findByRole('heading', { level: 1, name: 'Viz builder sandbox' }, { timeout: 5000 })
    expect(parseSpecHash(router.state.location.hash)).toMatchObject({ calcs: [{ name: 'Hours' }], columns: [{ field: 'Hours' }] })
  })

  it('inserts fields and functions at the cursor', async () => {
    await renderAt('/build/calc', 'Calc playground')
    await user.click(screen.getByText('Functions'))
    await user.click(screen.getByRole('button', { name: /^UPPER\(string\)/ }))
    await user.click(screen.getByRole('button', { name: /^Device/ }))
    expect(screen.getByRole('textbox', { name: 'Formula' })).toHaveValue('UPPER([Device]')
  })
})

describe('calc exercises', () => {
  it('checks a formula against the answer, then records the exercise', async () => {
    await renderAt('/build/calc/hours-watched', 'Arithmetic: hours watched')
    expect(screen.getByText(/Fields to use: \[Minutes Watched\]/)).toBeInTheDocument()

    check.mockResolvedValueOnce({ ok: false, message: 'For Session ID 24-000001, your calculation gives 900; it should give 0.25.' })
    await setFormula('[Minutes Watched] * 60')
    await user.click(screen.getByRole('button', { name: 'Check my formula' }))
    expect(await screen.findByText(/your calculation gives 900/)).toBeInTheDocument()
    expect(check).toHaveBeenCalledWith({ source: 'sessions', calcs: [] }, '[Minutes Watched] * 60', '[Minutes Watched] / 60', [])

    // Editing clears the feedback.
    check.mockResolvedValueOnce({ ok: true })
    await setFormula('[Minutes Watched] / 60')
    expect(screen.queryByText(/your calculation gives 900/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Check my formula' }))
    const status = await screen.findByRole('status')
    expect(within(status).getByText(/That’s right/)).toBeInTheDocument()
    expect(within(status).getByRole('link', { name: /Next exercise/ })).toBeInTheDocument()
    expect(getProgress().calcExercises['hours-watched']).toBeTypeOf('number')

    await user.click(screen.getByRole('button', { name: /Show a hint/ }))
    expect(screen.getByText(/Field names go in square brackets/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show an answer' }))
    expect(screen.getByText('[Minutes Watched] / 60', { selector: 'code' })).toBeInTheDocument()
  })

  it('is linked from the Build page', async () => {
    await renderAt('/build', 'Build')
    expect(screen.getByRole('link', { name: 'Calc playground' })).toBeInTheDocument()
  })

  it('says when an exercise is missing', async () => {
    await renderAt('/build/calc/no-such-exercise', 'Exercise not found')
    expect(screen.getByRole('link', { name: 'Calc playground' })).toBeInTheDocument()
  })
})
