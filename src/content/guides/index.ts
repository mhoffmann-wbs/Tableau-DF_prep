import type { MDXComponents } from 'mdx/types'
import type { ComponentType } from 'react'
import { type GuideMeta, guideMetaSchema } from '../schema'

// One MDX file per guide: <id>.mdx, exporting `meta`.
interface GuideModule {
  default: ComponentType<{ components?: MDXComponents }>
  meta: unknown
}

const modules = import.meta.glob<GuideModule>('./*.mdx', { eager: true })

export interface Guide {
  meta: GuideMeta
  Content: GuideModule['default']
}

/** The guides in list order. */
export const GUIDE_ORDER = ['cheat-sheet', 'exam-day'] as const

export const GUIDES: Map<string, Guide> = new Map(
  Object.values(modules).map((mod) => {
    const meta = guideMetaSchema.parse(mod.meta)
    return [meta.id, { meta, Content: mod.default }]
  }),
)
