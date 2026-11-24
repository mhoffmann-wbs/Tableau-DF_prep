// Calc playground exercises (PLAN.md §7b). Each file under calc/ is a JSON array
// named after the task of its first objective. The learner's formula passes
// when it gives the same values as `expected` over the whole data source
// (row-level) or for every member of `by` (aggregate). Content tests check that
// every accepted formula passes and every wrong one fails.
import { z } from 'zod'
import { SOURCES } from '../engine/spec.ts'

const nonEmpty = z.string().trim().min(1)

export const calcExerciseSchema = z.object({
  /** Stable slug: progress stores completions by id, so never rename one. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: nonEmpty,
  objectives: z.array(z.string().regex(/^\d\.\d\.\d$/)).min(1),
  source: z.enum(SOURCES),
  /** The name the calculated field gets, as the prompt calls it. */
  name: nonEmpty,
  prompt: nonEmpty,
  /** The fields the formula needs, listed next to the editor. */
  fields: z.array(nonEmpty).min(1),
  /** The reference formula the learner's output must match. */
  expected: nonEmpty,
  /** Aggregate exercises: the dimensions the values are compared at (none = the whole source). */
  by: z.array(nonEmpty).default([]),
  /** Other formulas that must pass, so the check doesn't demand one spelling. */
  accepted: z.array(nonEmpty).default([]),
  /** Near misses that must fail. */
  wrong: z.array(nonEmpty).default([]),
  hints: z.array(nonEmpty).default([]),
  /** Shown once solved: what the formula teaches for the exam. */
  debrief: nonEmpty,
})

export type CalcExercise = z.infer<typeof calcExerciseSchema>

const files = import.meta.glob<unknown>('./calc/*.json', { eager: true, import: 'default' })

export const CALC_FILES: Record<string, unknown> = Object.fromEntries(
  Object.entries(files).map(([path, data]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), data]),
)

/** In file order (task ids sorted), then file order within each file. */
export const CALC_EXERCISES: CalcExercise[] = Object.keys(CALC_FILES)
  .sort()
  .flatMap((task) => z.array(calcExerciseSchema).parse(CALC_FILES[task]))

export const CALC_EXERCISE_BY_ID = new Map(CALC_EXERCISES.map((e) => [e.id, e]))
