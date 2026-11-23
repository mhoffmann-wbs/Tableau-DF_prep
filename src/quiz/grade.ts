// Learner responses and all-or-nothing grading. Every item kind is "pick N of
// the options", so a response is the list of chosen option indexes.
import { type Item, selectCount } from '../content/schema'

export type Response = number[]

/** Option indexes of the key. */
export const keyOf = (item: Item): number[] => item.options.flatMap((o, i) => (o.correct ? [i] : []))

/** Whether the learner picked as many options as the item asks for. */
export const isAnswered = (item: Item, r: Response) => r.length === selectCount(item)

export function grade(item: Item, r: Response): boolean {
  const key = keyOf(item)
  return r.length === key.length && key.every((i) => r.includes(i))
}
