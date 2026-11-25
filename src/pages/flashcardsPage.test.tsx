// @vitest-environment jsdom
// The flashcards pages: a review session over the built-in cards, and an own
// deck made in the editor and reviewed. Scheduling itself is covered by
// flashcards/leitner.test.ts.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../app/routes'
import { FLASHCARDS } from '../content/flashcards'
import { getProgress, resetProgress } from '../progress/store'

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

describe('flashcards', () => {
  it('reviews a task’s cards: Again brings a card back, Good schedules it', async () => {
    const cards = FLASHCARDS.filter((c) => c.taskId === '4.2')
    await renderAt('/flashcards?task=4.2', /^4\.2 /)
    expect(screen.getByText(`Card 1 of ${cards.length} · new`)).toBeTruthy()
    expect(screen.getByText(cards[0]!.front)).toBeTruthy()
    await user.keyboard(' ')
    await user.click(screen.getByRole('button', { name: /^Again/ }))
    expect(getProgress().flashcards[cards[0]!.id]?.box).toBe(0)
    expect(screen.getByText(`Card 2 of ${cards.length + 1} · new`)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show answer' }))
    await user.keyboard('2')
    expect(getProgress().flashcards[cards[1]!.id]?.box).toBe(1)
  })

  it('makes an own deck, then reviews it to the end', async () => {
    const router = await renderAt('/flashcards/deck/new', 'New deck')
    await user.click(screen.getByRole('button', { name: 'Save deck' }))
    expect(screen.getByRole('alert').textContent).toBe('Give the deck a name.')
    await user.type(screen.getByLabelText('Deck name'), 'LOD')
    await user.type(screen.getByLabelText('Card 1 front'), 'FIXED')
    await user.click(screen.getByRole('button', { name: 'Save deck' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Card 1 needs a front and a back/)
    await user.type(screen.getByLabelText('Card 1 back'), 'Ignores the view')
    await user.click(screen.getByRole('button', { name: 'Save deck' }))
    await screen.findByRole('heading', { level: 1, name: 'Flashcards' })
    expect(router.state.location.pathname).toBe('/flashcards')
    expect(getProgress().decks.map((d) => [d.name, d.cards.length])).toEqual([['LOD', 1]])

    await user.click(screen.getByRole('link', { name: 'Review' }))
    await screen.findByText('FIXED')
    await user.click(screen.getByRole('button', { name: 'Show answer' }))
    await user.click(screen.getByRole('button', { name: /^Easy/ }))
    expect(screen.getByRole('status').textContent).toBe('Session complete: 1 review, 0 rated Again.')
  })
})
