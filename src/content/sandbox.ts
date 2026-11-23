// "Make this chart" challenges for the sandbox (PLAN.md §7a). They live as data
// in sandbox-challenges.json: the learner sees the target chart (drawn from the
// first accepted spec) and builds it; engine/match.ts compares their spec with
// every accepted spec. Content tests check that each one draws and matches.
import { z } from 'zod'
import { vizSpecSchema } from '../engine/spec.ts'
import data from './sandbox-challenges.json'

const nonEmpty = z.string().trim().min(1)

export const sandboxChallengeSchema = z.object({
  /** Stable slug: progress stores completions by id, so never rename one. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: nonEmpty,
  objectives: z.array(z.string().regex(/^\d\.\d\.\d$/)).min(1),
  /** What to build, in words; the target chart is shown next to it. */
  prompt: nonEmpty,
  /** Where the sandbox starts. Default: an empty sheet on the target's data source. */
  start: vizSpecSchema.optional(),
  /** Specs that count as solved; the first one is drawn as the target. */
  accept: z.array(vizSpecSchema).min(1),
  /** Shown one at a time on request. */
  hints: z.array(nonEmpty).default([]),
  /** Shown once solved: what the chart teaches for the exam. */
  debrief: nonEmpty,
})

export type SandboxChallenge = z.infer<typeof sandboxChallengeSchema>

export const SANDBOX_CHALLENGES: SandboxChallenge[] = z.array(sandboxChallengeSchema).parse(data)

export const SANDBOX_CHALLENGE_BY_ID = new Map(SANDBOX_CHALLENGES.map((c) => [c.id, c]))
