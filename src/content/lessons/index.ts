import type { MDXComponents } from 'mdx/types'
import type { ComponentType } from 'react'
import { type LessonMeta, lessonMetaSchema } from '../schema'

// One MDX file per task: <taskId>.mdx (e.g. 2.3.mdx), exporting `meta`.
interface LessonModule {
  default: ComponentType<{ components?: MDXComponents }>
  meta: unknown
}

const modules = import.meta.glob<LessonModule>('./*.mdx', { eager: true })

export interface Lesson {
  meta: LessonMeta
  Content: LessonModule['default']
}

export const LESSONS: Map<string, Lesson> = new Map(
  Object.values(modules).map((mod) => {
    const meta = lessonMetaSchema.parse(mod.meta)
    return [meta.taskId, { meta, Content: mod.default }]
  }),
)

/** Every lesson body must contain these sections, in this order. */
export const REQUIRED_SECTIONS = ['## Big idea', '## How it works', '## At Driftlight', '## Exam traps', '## Build'] as const
