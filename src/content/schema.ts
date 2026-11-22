// Zod schema for question-bank items (PLAN.md §4). Items live as JSON arrays in
// src/content/questions/<taskId>.json and are rendered generically. Cross-checks
// against the blueprint live in the content tests, so this file stays
// independent of blueprint data.
import { z } from 'zod'
import { vizSpecSchema } from '../engine/spec.ts'

const nonEmpty = z.string().trim().min(1)

const option = z.object({
  text: nonEmpty,
  correct: z.boolean(),
  /** Why this option is right, or the tempting mistake behind it. */
  rationale: nonEmpty,
})

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
  const phrase = /\(Choose \d answers\.\)/.exec(item.stem)?.[0]
  if (select > 1 && phrase !== choosePhrase(select)) issue(`stem must say "${choosePhrase(select)}"`, ['stem'])
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
