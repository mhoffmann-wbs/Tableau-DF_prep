// Zod schema for question-bank items (PLAN.md §4). Items live as JSON arrays in
// src/content/questions/<taskId>.json and are rendered generically. Cross-checks
// against the blueprint live in the content tests, so this file stays
// independent of blueprint data.
import { z } from 'zod'
import { pillSchema, vizSpecSchema } from '../engine/spec.ts'

const nonEmpty = z.string().trim().min(1)

const option = z.object({
  text: nonEmpty,
  correct: z.boolean(),
  /** Why this option is right, or the tempting mistake behind it. */
  rationale: nonEmpty,
})

/**
 * A number or member a lesson or `viz` item states about the Driftlight data, declared as a
 * query so a test can recompute it. `value` reads the `measure` column of the
 * one row whose discrete members match `where`; `top` reads the `dimension`
 * member of the row with the largest (or smallest) `measure`. `says` is the text
 * the lesson shows, and must equal the computed result.
 */
export const factSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('value'),
    says: nonEmpty,
    spec: vizSpecSchema,
    measure: pillSchema,
    /** Field name → display member, picking one row. Omit when the view has a single mark. */
    where: z.record(z.string(), z.string()).optional(),
    /** Decimal places; `percent` multiplies by 100 and appends %. */
    digits: z.number().int().min(0).max(3).default(0),
    percent: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('top'),
    says: nonEmpty,
    spec: vizSpecSchema,
    dimension: pillSchema,
    measure: pillSchema,
    order: z.enum(['desc', 'asc']).default('desc'),
  }),
])

export type Fact = z.infer<typeof factSchema>

const base = {
  /** `${taskId}-NNN`, e.g. "2.3-014". */
  id: z.string().regex(/^\d\.\d-\d{3}$/),
  taskId: z.string().regex(/^\d\.\d$/),
  /** Objective ids this item tests, e.g. ["2.3.5"]. All must belong to taskId. */
  objectives: z.array(z.string().regex(/^\d\.\d\.\d$/)).min(1),
  stem: nonEmpty,
  explanation: nonEmpty,
  /** Docs backing a non-obvious Tableau fact (menu path, default, limitation). */
  sourceLinks: z.array(z.url()).optional(),
}

/** Multi-select stems say how many to pick, as on the exam. */
export const choosePhrase = (n: number) => `(Choose ${n} answers.)`

const single = z.object({
  ...base,
  kind: z.literal('single'),
  options: z.array(option).length(4),
})

const multi = z.object({
  ...base,
  kind: z.literal('multi'),
  select: z.number().int().min(2).max(3),
  options: z.array(option).min(5).max(6),
})

const viz = z.object({
  ...base,
  kind: z.literal('viz'),
  /** 1 = single choice; 2–3 = multi-select (the stem then says how many). */
  select: z.number().int().min(1).max(3),
  options: z.array(option).min(4).max(6),
  viz: z.object({
    spec: vizSpecSchema,
    /** Draw the chart, the shelves as pills, or both. */
    show: z.enum(['chart', 'shelves', 'both']).default('chart'),
  }),
  /** Driftlight numbers or members the item states; each `says` must appear in the stem or an option. */
  checks: z.array(factSchema).optional(),
})

export const itemSchema = z.discriminatedUnion('kind', [single, multi, viz]).superRefine((item, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path })

  if (!item.id.startsWith(`${item.taskId}-`)) issue('id must start with taskId', ['id'])
  for (const [i, o] of item.objectives.entries()) {
    if (!o.startsWith(`${item.taskId}.`)) issue(`objective ${o} is not under task ${item.taskId}`, ['objectives', i])
  }

  const select = item.kind === 'single' ? 1 : item.select
  const correct = item.options.filter((o) => o.correct).length
  if (correct !== select) issue(`${correct} correct options, expected ${select}`, ['options'])
  const phrases = item.stem.match(/\(Choose \d answers\.\)/g) ?? []
  const phrase = phrases[0]
  if (select > 1 && phrase !== choosePhrase(select)) issue(`stem must say "${choosePhrase(select)}"`, ['stem'])
  if (phrases.length > 1) issue('stem says how many to choose more than once', ['stem'])
  if (select === 1 && phrase) issue('single-choice stem must not say how many to choose', ['stem'])
  if (item.kind === 'viz' && select > 1 && item.options.length < 5) issue('multi-select needs at least 5 options', ['options'])

  const texts = item.options.map((o) => o.text.trim().toLowerCase())
  if (new Set(texts).size !== texts.length) issue('duplicate option texts', ['options'])
})

export type Item = z.infer<typeof itemSchema>
export type ItemKind = Item['kind']

export const itemFileSchema = z.array(itemSchema)

/** How many options the learner must pick. */
export const selectCount = (item: Item) => (item.kind === 'single' ? 1 : item.select)

// ---- lessons (PLAN.md §5) ----

/** Lessons cite Tableau's own help, release notes and Tableau Public pages. */
const LESSON_LINK = /^https:\/\/(help\.tableau\.com|www\.tableau\.com|public\.tableau\.com)\//


const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

export const lessonMetaSchema = z.object({
  taskId: z.string().regex(/^\d\.\d$/),
  /** Date the lesson's Tableau facts were last checked against the help. */
  updated: z.iso.date(),
  /** One or two sentences: what the learner must take away. */
  tldr: nonEmpty,
  /** Objective ids the lesson teaches; a content test requires all of the task's. */
  objectivesCovered: z.array(z.string().regex(/^\d\.\d\.\d$/)).min(1),
  /** Sources for the lesson's Tableau facts. */
  links: z.array(z.object({ title: nonEmpty, url: z.url().regex(LESSON_LINK) })).min(1),
  /** Charts the lesson embeds with <LessonViz id="…" />, each with an "Open in sandbox" link. */
  vizzes: z
    .record(
      slug,
      z.object({
        spec: vizSpecSchema,
        show: z.enum(['chart', 'shelves', 'both']).default('both'),
        caption: nonEmpty,
      }),
    )
    .default({}),
  /** Data facts the lesson shows with <Fact id="…" />. */
  facts: z.record(slug, factSchema).default({}),
})

export type LessonMeta = z.infer<typeof lessonMetaSchema>

/** A print-ready guide (PLAN.md §8): its facts come from the lessons in `sources` and from EXAM_FORMAT. */
export const guideMetaSchema = z.object({
  id: slug,
  title: nonEmpty,
  /** One sentence for the guide list. */
  summary: nonEmpty,
  /** Date the guide was last checked against its lessons and the exam guide. */
  updated: z.iso.date(),
  /** Task ids whose lessons the guide's Tableau facts come from. */
  sources: z.array(z.string().regex(/^\d\.\d$/)),
})

export type GuideMeta = z.infer<typeof guideMetaSchema>
