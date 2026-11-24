// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
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
    expect(screen.getByRole('link', { name: '4.1 Understand dimensions and measures' })).toHaveAttribute('href', '/learn/4.1')
  })

  it('draws shelves with blue discrete and green continuous pills on the chart gallery', async () => {
    await renderAt('/dev/charts', 'Chart gallery')
    const columns = screen.getAllByRole('group', { name: 'Columns shelf' })[1]!
    expect(columns).toHaveTextContent('MONTH(Start) (continuous)')
    const rows = screen.getAllByRole('group', { name: 'Rows shelf' })[0]!
    expect(rows).toHaveTextContent('Genre (discrete)')
    expect(screen.getAllByText('Drawing the chart…').length).toBeGreaterThan(0)
  })

  it('offers practice on every task and domain and a mock exam from the real bank', async () => {
    await renderAt('/practice', 'Practice')
    expect(screen.queryByText('(no questions yet)')).toBeNull()
    cleanup()
    await renderAt('/mock', 'Mock exam')
    expect(screen.getByRole('button', { name: 'Start the mock exam' })).toBeEnabled()
  })

  it('lists lessons by domain in guide order and marks a lesson as read', async () => {
    await renderAt('/learn', 'Learn')
    const domains = screen.getAllByRole('heading', { level: 2 })
    expect(domains[0]).toHaveTextContent('1. Connecting to and Preparing Data')
    expect(domains[3]).toHaveTextContent('4. Understanding Tableau Concepts')
    const items = within(domains[0]!.closest('section')!).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1.1 Create live connections and extracts')
    cleanup()
    await renderAt('/learn/4.1', '4.1 Understand dimensions and measures')
    expect(screen.getByRole('heading', { level: 2, name: 'Exam traps' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open in sandbox' })[0]).toHaveAttribute('href', expect.stringMatching(/^\/build\/sandbox#spec=/))
    screen.getByRole('button', { name: 'Mark as read' }).click()
    expect(await screen.findByRole('button', { name: '✓ Marked as read' })).toBeInTheDocument()
  })

  it('lists the guides and shows each with numbers from the exam guide', async () => {
    await renderAt('/guides', 'Guides')
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Cheat sheet' })).toHaveAttribute('href', '/guides/cheat-sheet')
    cleanup()
    await renderAt('/guides/exam-day', /Exam-day guide/)
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    // 70 minutes for 40 items is 105 s; with 5 unscored items, 93 s. 48% of 40 needs 20.
    expect(screen.getByText(/is 1 min 45 s per item/)).toBeInTheDocument()
    expect(screen.getByText(/it's 1 min 33 s/)).toBeInTheDocument()
    expect(screen.getByText(/is 20 correct answers/)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2. Exploring and Analyzing Data' }).closest('tr')).toHaveTextContent('37%15')
    // The footer doesn't print, so the guide repeats the notice for paper.
    expect(screen.getAllByText(/Not affiliated with or endorsed by Salesforce/)).toHaveLength(2)
    cleanup()
    await renderAt('/guides/cheat-sheet', /Cheat sheet/)
    for (const link of screen.getAllByRole('link', { name: '2.2 Organize data and apply filters' })) expect(link).toHaveAttribute('href', '/learn/2.2')
    expect(screen.getByRole('cell', { name: 'Highlight table' })).toBeInTheDocument()
  })

  it('shows the non-affiliation footer and a not-found page', async () => {
    await renderAt('/nope', 'Page not found')
    expect(screen.getByText(/Not affiliated with or endorsed by Salesforce/)).toBeInTheDocument()
  })
})
