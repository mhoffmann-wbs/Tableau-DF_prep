// Flashcards (PLAN.md §7e). Each file under flashcards/ is a JSON array of the
// built-in cards for one task. Tableau facts on a card come from that task's
// lesson, which was checked against the help. Learners' own decks share the
// card shape without the metadata, and travel as deck files.
import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)

export const CARD_KINDS = ['term', 'menu', 'file', 'recipe', 'rule'] as const
export type CardKind = (typeof CARD_KINDS)[number]

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  term: 'Term',
  menu: 'Menu path',
  file: 'File type',
  recipe: 'Chart recipe',
  rule: 'Rule',
}

export const flashcardSchema = z.object({
  /** `<taskId>-cNNN`. Review state is stored by id, so never renumber a card. */
  id: z.string().regex(/^\d\.\d-c\d{3}$/),
  objectives: z.array(z.string().regex(/^\d\.\d\.\d$/)).min(1),
  kind: z.enum(CARD_KINDS),
  front: nonEmpty.max(200),
  back: nonEmpty.max(400),
})

export type Flashcard = z.infer<typeof flashcardSchema> & { taskId: string }

const files = import.meta.glob<unknown>('./flashcards/*.json', { eager: true, import: 'default' })

export const FLASHCARD_FILES: Record<string, unknown> = Object.fromEntries(
  Object.entries(files).map(([path, data]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), data]),
)

/** In file order (task ids sorted), then file order within each file. */
export const FLASHCARDS: Flashcard[] = Object.keys(FLASHCARD_FILES)
  .sort()
  .flatMap((task) => z.array(flashcardSchema).parse(FLASHCARD_FILES[task]).map((c) => ({ ...c, taskId: task })))

// A shared deck holds only the cards: review state stays in each learner's browser.
export const DECK_FILE_APP = 'tableau-df-prep-deck'
export const deckCardSchema = z.object({ front: nonEmpty.max(200), back: nonEmpty.max(400) })
export const deckFileSchema = z.object({
  app: z.literal(DECK_FILE_APP),
  name: nonEmpty.max(80),
  cards: z.array(deckCardSchema).min(1).max(500),
})
export type DeckFile = z.infer<typeof deckFileSchema>

/** Reads a deck file; throws an Error with a message for the learner if it isn't one. */
export function parseDeckFile(json: string): DeckFile {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    throw new Error("This file isn't valid JSON.")
  }
  if ((doc as { app?: unknown } | null)?.app !== DECK_FILE_APP) throw new Error("This file isn't a Tableau-DF prep flashcard deck.")
  const result = deckFileSchema.safeParse(doc)
  if (!result.success) throw new Error('This deck is damaged or has an empty card, so nothing was imported.')
  return result.data
}
