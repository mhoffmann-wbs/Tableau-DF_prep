// @vitest-environment jsdom
// The simulator page: the sim loads with its copy, and the closing items are
// answered in place and recorded. The data runtime is mocked (jsdom can't
// fetch the dataset); every sim state is drawn over the data in sims.test.ts.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../app/routes'
import { SIM_BY_ID } from '../content/sims'
import { getProgress, resetProgress } from '../progress/store'

vi.mock('../engine/runtime', () => ({
  renderViz: async () => () => {},
  runQuery: async () => ({
    columns: [{ id: 'c0', kind: 'measure', field: { name: 'Minutes Watched' } }],
    rows: [{ c0: 100 }],
  }),
}))

async function renderAt(path: string, heading: string | RegExp) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 })
  return router
}

const user = userEvent.setup()

beforeEach(() => {
  localStorage.clear()
  resetProgress()
})

describe('simulator page', () => {
  it('runs the granularity slider and records a closing item', async () => {
    const sim = SIM_BY_ID.get('granularity')!
    await renderAt('/build/sim/granularity', sim.title)
    expect(await screen.findByText(sim.copy.none!)).toBeTruthy()
    expect(await screen.findByText('1 mark')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'AVG' }))
    expect(screen.getByRole('button', { name: 'AVG' }).getAttribute('aria-pressed')).toBe('true')

    const checks = screen.getAllByRole('button', { name: 'Check answer' })
    expect(checks).toHaveLength(sim.items.length)
    await user.click(screen.getAllByRole('radio')[0]!)
    await user.click(checks[0]!)
    expect(getProgress().items[sim.items[0]!]?.attempts).toBe(1)
    expect(screen.getByRole('status').textContent).toMatch(/Correct|Not quite/)
  })

  it('switches a pill in Blue vs. green and explains it', async () => {
    const sim = SIM_BY_ID.get('blue-green')!
    await renderAt('/build/sim/blue-green', sim.title)
    await screen.findByText(sim.copy.discrete!)
    await user.click(screen.getByRole('button', { name: 'Continuous' }))
    expect(screen.getByText(sim.copy.continuous!)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Genre' }))
    expect(screen.getByText(sim.copy.stringOnly!)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continuous' }).hasAttribute('disabled')).toBe(true)
  })

  it('says when a simulator does not exist', async () => {
    await renderAt('/build/sim/nope', 'Simulator not found')
    expect(screen.getByRole('link', { name: 'All simulators' })).toHaveAttribute('href', '/build/sim')
  })

  it('lists the simulators', async () => {
    await renderAt('/build/sim', 'Concept simulators')
    expect(screen.getByRole('link', { name: SIM_BY_ID.get('granularity')!.title })).toHaveAttribute('href', '/build/sim/granularity')
  })
})
