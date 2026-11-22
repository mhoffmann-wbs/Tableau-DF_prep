// Content tests over the real question bank. They pass vacuously while the bank
// is empty and guard every file as it is added.
import { describe, expect, it } from 'vitest'
import { OBJECTIVE_BY_ID, TASK_BY_ID } from './blueprint'
import { ITEMS, QUESTION_FILES } from './bank'
import { QUALITY_CHECKS } from './quality'
import { itemFileSchema } from './schema'

describe('question bank', () => {
  it.each(Object.entries(QUESTION_FILES))('%s.json parses and belongs to its task', (fileId, data) => {
    expect(TASK_BY_ID.has(fileId), `no task ${fileId}`).toBe(true)
    const parsed = itemFileSchema.safeParse(data)
    expect(parsed.success, parsed.error?.message).toBe(true)
    for (const item of parsed.data ?? []) {
      expect(item.taskId).toBe(fileId)
      for (const o of item.objectives) expect(OBJECTIVE_BY_ID.has(o), `${item.id}: unknown objective ${o}`).toBe(true)
    }
  })

  it('has unique item ids', () => {
    const ids = ITEMS.map((i) => i.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it.each(Object.entries(QUALITY_CHECKS))('passes the %s check', (_, check) => {
    expect(check(ITEMS)).toEqual([])
  })
})
