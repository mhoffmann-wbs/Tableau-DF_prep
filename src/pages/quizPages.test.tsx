// @vitest-environment jsdom
// The quiz pages over a fake bank (the real one is empty until phase 5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../app/routes'
import { getProgress, resetProgress } from '../progress/store'

vi.mock('../content/bank', async () => {
  const { MULTI, VIZ, fakeBank, fakeItem } = await import('../test/fixtures')
  return { QUESTION_FILES: {}, ITEMS: [...fakeBank(3), fakeItem('4.1', 9, MULTI), fakeItem('4.2', 9, VIZ)] }
})

/** Renders a route and waits for its lazy page. */
async function renderAt(path: string, heading?: string | RegExp) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  if (heading) await screen.findByRole('heading', { level: 1, name: heading })
}

beforeEach(() => {
  localStorage.clear()
  resetProgress()
})

describe('practice', () => {
  it('lists domains and tasks with their item counts', async () => {
    await renderAt('/practice', 'Practice')
    expect(screen.getByRole('link', { name: /2\.1 Create basic charts \(3\)/ })).toHaveAttribute('href', '/practice?task=2.1')
    expect(screen.getByRole('link', { name: /4\. Understanding Tableau Concepts \(11\)/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Least mastered' }))
    expect(screen.getByRole('link', { name: '10 questions' })).toHaveAttribute('href', '/practice?mix=10&focus=1')
  })

  it('runs a task session with feedback, records answers and ends with a review', async () => {
    const user = userEvent.setup()
    await renderAt('/practice?task=1.2')
    for (let n = 0; n < 3; n++) {
      await screen.findByText(`Question ${n + 1} of 3`, { exact: false })
      // The session label, and the task above the stem.
      expect(screen.getAllByText('1.2 Create and manage the data model')).toHaveLength(2)
      // Option A (Genre) is the key; the second item gets a wrong answer.
      await user.keyboard(n === 1 ? 'b' : 'a')
      await user.click(screen.getByRole('button', { name: 'Check answer' }))
      expect(screen.getByRole('status')).toHaveTextContent(n === 1 ? 'Not quite' : 'Correct')
      expect(screen.getByText(/Objective 1\.2\.1: Add relationships to a data source/)).toBeInTheDocument()
      await user.keyboard('{Enter}')
    }
    expect(await screen.findByRole('heading', { level: 1, name: /Session complete/ })).toBeInTheDocument()
    expect(screen.getByText('2 / 3 correct.')).toBeInTheDocument()
    expect(screen.getAllByLabelText('missed')).toHaveLength(1)
    expect(Object.keys(getProgress().items)).toHaveLength(3)
  })
})

describe('question bank', () => {
  it('filters by kind and mastery', async () => {
    const user = userEvent.setup()
    await renderAt('/questions', 'Question bank')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'Read the viz')
    expect(screen.getAllByRole('link', { name: /Read the viz ·/ })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /Single answer ·/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recent error (0)' }))
    expect(screen.getByText('No questions match this filter.')).toBeInTheDocument()
  })

  it('caps a multi-select item at its count and grades it all or nothing', async () => {
    const user = userEvent.setup()
    await renderAt('/questions/4.1-009')
    await screen.findByText('Select TWO.')
    const check = screen.getByRole('button', { name: 'Check answer' })
    await user.click(screen.getByRole('checkbox', { name: /Minutes Watched/ }))
    expect(check).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Country/ }))
    await user.click(screen.getByRole('checkbox', { name: /Monthly Price/ }))
    expect(screen.getByRole('checkbox', { name: /Monthly Price/ })).not.toBeChecked()
    await user.click(check)
    expect(screen.getByRole('status')).toHaveTextContent('Not quite')
    expect(getProgress().items['4.1-009']).toMatchObject({ attempts: 1, lastCorrect: false })
  })

  it('shows a viz item’s shelves and chart', async () => {
    await renderAt('/questions/4.2-009')
    expect(await screen.findByRole('group', { name: 'Columns shelf' })).toHaveTextContent('MONTH(Start) (continuous)')
    expect(screen.getByRole('figure', { name: 'Chart for this question' })).toBeInTheDocument()
  })
})

describe('mock exam', () => {
  it('runs a timed mock without the task names, scores it by domain and saves the result', async () => {
    const user = userEvent.setup()
    await renderAt('/mock', 'Mock exam')
    // 9 · 9 · 9 · 6 items exist for the 9 · 15 · 10 · 6 split: 33 items at the real pace.
    expect(screen.getByText(/This mock has/)).toHaveTextContent('33 questions')
    expect(screen.getByText(/This mock has/)).toHaveTextContent('58 min')
    await user.click(screen.getByRole('button', { name: 'Start the mock exam' }))
    expect(screen.getByLabelText('time remaining')).toHaveTextContent('0:58:00')
    expect(screen.queryByText(/Create and manage the data model|Understand dimensions and measures/)).not.toBeInTheDocument()
    await user.keyboard('a')
    await user.keyboard('m')
    for (let n = 0; n < 33; n++) await user.keyboard('{Enter}')
    expect(screen.getByText(/32 question\(s\) unanswered\. 1 flagged\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Submit exam' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Not yet: keep practising' })).toBeInTheDocument()
    const domains = screen.getAllByRole('table')[0]!
    expect(within(domains).getByText('2. Exploring and Analyzing Data')).toBeInTheDocument()
    expect(getProgress().mockResults).toHaveLength(1)
    expect(getProgress().mockResults[0]).toMatchObject({ total: 33 })
    expect(Object.keys(getProgress().items)).toHaveLength(33)
  })
})

describe('progress', () => {
  it('shows readiness by domain, the weakest tasks and the data controls', async () => {
    await renderAt('/progress', 'Progress')
    expect(screen.getByText('Weighted readiness').nextSibling).toHaveTextContent('0%')
    expect(screen.getByRole('link', { name: 'Run the weak-spot drill' })).toHaveAttribute('href', '/practice?weak=1')
    expect(screen.getByRole('button', { name: 'Export progress' })).toBeInTheDocument()
  })
})
