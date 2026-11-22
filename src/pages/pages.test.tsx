// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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

  it('shows the non-affiliation footer and a not-found page', async () => {
    await renderAt('/nope', 'Page not found')
    expect(screen.getByText(/Not affiliated with or endorsed by Salesforce/)).toBeInTheDocument()
  })
})
