// Anti-giveaway checks for the question bank (PLAN.md §4). Each check returns a
// list of human-readable problems; an empty list means the bank passes.
import { type Item, selectCount } from './schema.ts'

/** Share limits only apply once a pool is big enough for shares to mean anything. */
export const MIN_POOL_FOR_SHARES = 12
export const MAX_SHARE = 0.4

const LETTERS = 'ABCDEF'

/** Single-answer items: `single`, plus `viz` items with one key. */
const singleAnswer = (items: Item[]) => items.filter((i) => selectCount(i) === 1)

/** No answer letter may be the key of more than 40% of single-answer items. */
export function keyLetterBalance(items: Item[]): string[] {
  const pool = singleAnswer(items)
  if (pool.length < MIN_POOL_FOR_SHARES) return []
  const counts = new Map<string, number>()
  for (const item of pool) {
    const letter = LETTERS[item.options.findIndex((o) => o.correct)]!
    counts.set(letter, (counts.get(letter) ?? 0) + 1)
  }
  return [...counts]
    .filter(([, n]) => n / pool.length > MAX_SHARE)
    .map(([letter, n]) => `key ${letter} is correct in ${n}/${pool.length} single-answer items (max ${MAX_SHARE * 100}%)`)
}

/** The key may be the strictly longest option in at most 40% of single-answer items. */
export function keyIsLongest(items: Item[]): string[] {
  const pool = singleAnswer(items)
  if (pool.length < MIN_POOL_FOR_SHARES) return []
  const longest = pool.filter((item) => {
    const key = item.options.find((o) => o.correct)!.text.length
    return item.options.every((o) => o.correct || o.text.length < key)
  }).length
  return longest / pool.length > MAX_SHARE
    ? [`key is the longest option in ${longest}/${pool.length} single-answer items (max ${MAX_SHARE * 100}%)`]
    : []
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Stem plus viz must be unique ("What does this view show?" alone may repeat). */
export function duplicateStems(items: Item[]): string[] {
  const seen = new Map<string, string>()
  const problems: string[] = []
  for (const item of items) {
    const key = `${norm(item.stem)}\n${item.kind === 'viz' ? JSON.stringify(item.viz) : ''}`
    const other = seen.get(key)
    if (other) problems.push(`${item.id} duplicates the stem of ${other}`)
    else seen.set(key, item.id)
  }
  return problems
}

const LETTER_REF = /\b([Oo]ption|[Aa]nswer|[Cc]hoice)\s+[A-F]\b|\([A-F]\)|\b[A-F]\)\s/

/** Explanations and rationales must not cite option letters, so options can be reordered. */
export function letterReferences(items: Item[]): string[] {
  return items.flatMap((item) => {
    const texts = [item.explanation, ...item.options.map((o) => o.rationale)]
    return texts.some((t) => LETTER_REF.test(t)) ? [`${item.id} refers to an option letter`] : []
  })
}

export const QUALITY_CHECKS = { keyLetterBalance, keyIsLongest, duplicateStems, letterReferences }
