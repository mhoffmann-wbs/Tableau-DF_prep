// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '../app/routes'

/** Renders a route and waits for its lazy page. */
async function renderAt(path: string, heading: string | RegExp) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  return screen.findByRole('heading', { level: 1, name: heading })
}

describe('pages', () => {
  it('shows the exam format and every domain on the home page', async () => {
    await renderAt('/', 'Salesforce Certified Tableau Desktop Foundations')
    expect(screen.getByText('70 minutes')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /2\. Exploring and Analyzing Data/ })).toHaveTextContent('15 of 40 mock items')
    expect(screen.getByText('Create a density map')).toBeInTheDocument()
  })

  it('draws shelves with blue discrete and green continuous pills on the chart gallery', async () => {
    await renderAt('/dev/charts', 'Chart gallery')
    const columns = screen.getAllByRole('group', { name: 'Columns shelf' })[1]!
    expect(columns).toHaveTextContent('MONTH(Start) (continuous)')
    const rows = screen.getAllByRole('group', { name: 'Rows shelf' })[0]!
    expect(rows).toHaveTextContent('Genre (discrete)')
    expect(screen.getAllByText('Drawing the chart…').length).toBeGreaterThan(0)
  })

  it('says the quiz pages have no questions while the bank is empty', async () => {
    await renderAt('/practice', 'Practice')
    expect(screen.getAllByText('(no questions yet)')).toHaveLength(16)
    cleanup()
    await renderAt('/mock', 'Mock exam')
    expect(screen.getByRole('button', { name: 'Start the mock exam' })).toBeDisabled()
  })

  it('shows the non-affiliation footer and a not-found page', async () => {
    await renderAt('/nope', 'Page not found')
    expect(screen.getByText(/Not affiliated with or endorsed by Salesforce/)).toBeInTheDocument()
  })
})
