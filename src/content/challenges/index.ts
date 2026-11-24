import type { MDXComponents } from 'mdx/types'
import type { ComponentType } from 'react'
import { LESSON_ORDER } from '../blueprint'
import { type ChallengeMeta, challengeMetaSchema } from '../schema'

// One MDX file per Tableau Public challenge: <id>.mdx, exporting `meta`.
interface ChallengeModule {
  default: ComponentType<{ components?: MDXComponents }>
  meta: unknown
}

const modules = import.meta.glob<ChallengeModule>('./*.mdx', { eager: true })

export interface Challenge {
  meta: ChallengeMeta
  Content: ChallengeModule['default']
}

/** In learning order (by task). */
export const CHALLENGES: Challenge[] = Object.values(modules)
  .map((mod) => ({ meta: challengeMetaSchema.parse(mod.meta), Content: mod.default }))
  .sort((a, b) => LESSON_ORDER.indexOf(a.meta.taskId) - LESSON_ORDER.indexOf(b.meta.taskId))

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.meta.id, c]))

/** Every challenge body must contain these sections, in this order. */
export const CHALLENGE_SECTIONS = ['## Goal', '## Get the data', '## Steps', '## Checkpoints', '## Exam angle'] as const
