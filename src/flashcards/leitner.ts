// Leitner boxes 0–5 (PLAN.md §7e). Again sends a card back to box 0, Good moves
// it up one box and Easy up two; the box sets when it's due again.

export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35] as const
export const TOP_BOX = INTERVAL_DAYS.length - 1
const DAY = 24 * 60 * 60 * 1000

export const RATINGS = ['again', 'good', 'easy'] as const
export type Rating = (typeof RATINGS)[number]

export interface CardState {
  box: number
  /** Epoch ms from which the card is due. */
  due: number
  lastAt: number
}

/** The box a rating moves a card to; a new card counts as box 0. */
export function nextBox(prev: CardState | undefined, rating: Rating): number {
  if (rating === 'again') return 0
  const box = prev?.box ?? 0
  return Math.min(TOP_BOX, box + (rating === 'easy' ? 2 : 1))
}

export function rate(prev: CardState | undefined, rating: Rating, now: number): CardState {
  const box = nextBox(prev, rating)
  return { box, due: now + INTERVAL_DAYS[box]! * DAY, lastAt: now }
}

/** "now", "1 day", "16 days": when a rating brings the card back. */
export function intervalLabel(box: number): string {
  const days = INTERVAL_DAYS[box]!
  return days === 0 ? 'now' : `${days} day${days === 1 ? '' : 's'}`
}

export function isDue(state: CardState | undefined, now: number): boolean {
  return state !== undefined && state.due <= now
}

/**
 * The cards for one session: due cards first (the most overdue first), then up
 * to `newLimit` cards never reviewed, in deck order.
 */
export function buildSession(ids: string[], states: Record<string, CardState>, now: number, newLimit: number): string[] {
  const due = ids.filter((id) => isDue(states[id], now)).sort((a, b) => states[a]!.due - states[b]!.due)
  const fresh = ids.filter((id) => states[id] === undefined).slice(0, newLimit)
  return [...due, ...fresh]
}

/** Due, new and per-box counts for a set of cards. */
export function deckStats(ids: string[], states: Record<string, CardState>, now: number) {
  const boxes = INTERVAL_DAYS.map(() => 0)
  let due = 0
  let fresh = 0
  for (const id of ids) {
    const s = states[id]
    if (!s) fresh++
    else {
      boxes[s.box]!++
      if (s.due <= now) due++
    }
  }
  return { due, fresh, boxes }
}
