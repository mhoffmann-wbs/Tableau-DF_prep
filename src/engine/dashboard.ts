// A simple dashboard (PLAN.md §9, 8.6): two sheets side by side or stacked,
// and filter actions between them (lesson 3.2). Data-free: the dashboard
// view turns the action state into filters on the target sheet's spec.
import { z } from 'zod'
import { compactSpec, emptySpec } from './edit.ts'
import { fieldsOf } from './model.ts'
import type { MarkMembers } from './runtime.ts'
import { type Filter, type VizSpec, vizSpecSchema } from './spec.ts'

export const RUN_ON = ['hover', 'select', 'menu'] as const
export type RunOn = (typeof RUN_ON)[number]

/** Clearing the selection will: Leave the filter, Show all values or Exclude all values. */
export const CLEARING = ['leave', 'all', 'exclude'] as const
export type Clearing = (typeof CLEARING)[number]

export const SHEET_COUNT = 2

const sheetIndex = z.number().int().min(0).max(SHEET_COUNT - 1)

export const filterActionSchema = z
  .object({
    name: z.string().trim().min(1),
    source: sheetIndex,
    target: sheetIndex,
    run: z.enum(RUN_ON).default('select'),
    clearing: z.enum(CLEARING).default('all'),
    /** Target filters: Selected fields; all of the source mark's fields when unset. */
    fields: z.array(z.string()).optional(),
    /** Made by the sheet's Use as Filter button, which removes it again. */
    useAsFilter: z.boolean().optional(),
  })
  .refine((a) => a.source !== a.target, 'An action’s source and target must be different sheets.')

export type FilterAction = z.infer<typeof filterActionSchema>

export const workbookSchema = z.object({
  sheets: z.array(vizSpecSchema).length(SHEET_COUNT),
  dashboard: z
    .object({
      /** A horizontal layout container puts the sheets side by side, a vertical one stacks them. */
      layout: z.enum(['horizontal', 'vertical']).default('horizontal'),
      actions: z.array(filterActionSchema).default([]),
    })
    .default({ layout: 'horizontal', actions: [] }),
})

export type Workbook = z.infer<typeof workbookSchema>

export const emptyWorkbook = (sheet1: VizSpec = emptySpec()): Workbook => workbookSchema.parse({ sheets: [sheet1, emptySpec(sheet1.source)] })

/** Sheet names as the tabs and the Actions dialog show them. */
export const sheetName = (i: number) => `Sheet ${i + 1}`

/** What an action is doing to its target: filtering to the members of some marks, or excluding everything. */
export type ActionState = { kind: 'filter'; marks: MarkMembers[] } | { kind: 'exclude' } | undefined

/** The action's state after the source selection changes to `marks` (empty = cleared). */
export function nextActionState(action: FilterAction, marks: MarkMembers[], prev: ActionState): ActionState {
  const picked = marks.filter((m) => m.length > 0)
  if (picked.length > 0) return { kind: 'filter', marks: picked }
  if (action.clearing === 'leave') return prev
  return action.clearing === 'exclude' ? { kind: 'exclude' } : undefined
}

/**
 * Fields an action can filter the target on: the discrete dimensions of the
 * source view, limited to the Selected fields, that the target's data source
 * also has under the same name.
 */
export function actionFields(action: FilterAction, source: VizSpec, target: VizSpec): string[] {
  const inTarget = new Set(fieldsOf(target).filter((f) => !f.special && !f.generated && f.role === 'dimension').map((f) => f.name))
  const inSource = viewDimensions(source)
  return inSource.filter((f) => inTarget.has(f) && (action.fields === undefined || action.fields.includes(f)))
}

/** The discrete, non-date dimensions on the source view's shelves and Marks card: the fields a mark reports. */
export function viewDimensions(spec: VizSpec): string[] {
  const fields = fieldsOf(spec)
  const pills = [...spec.columns, ...spec.rows, spec.marks.color, spec.marks.size, spec.marks.label, spec.marks.shape, ...spec.marks.detail]
  const names = pills.flatMap((p) => {
    const f = p && fields.find((x) => x.name === p.field)
    return f && f.role === 'dimension' && !p.agg && !p.date && f.type !== 'date' && f.type !== 'datetime' && !f.special && p.as !== 'continuous' ? [f.name] : []
  })
  return [...new Set(names)]
}

/**
 * The filters an action adds to its target: per field, the members of the
 * selected marks. `excluded` when the action excludes all values.
 */
export function actionFilters(action: FilterAction, state: ActionState, source: VizSpec, target: VizSpec): Filter[] | 'excluded' {
  if (!state) return []
  if (state.kind === 'exclude') return 'excluded'
  const fields = new Set(actionFields(action, source, target))
  const values = new Map<string, Set<string>>()
  for (const mark of state.marks)
    for (const { field, member } of mark) if (fields.has(field)) values.set(field, (values.get(field) ?? new Set()).add(member))
  return [...values].map(([field, members]) => ({ kind: 'values', field, values: [...members] }))
}

/** The target sheet as the dashboard draws it, or `excluded`. */
export function filteredSheet(workbook: Workbook, index: number, states: ActionState[]): VizSpec | 'excluded' {
  const sheet = workbook.sheets[index]!
  const added: Filter[] = []
  for (const [i, action] of workbook.dashboard.actions.entries()) {
    if (action.target !== index) continue
    const filters = actionFilters(action, states[i], workbook.sheets[action.source]!, sheet)
    if (filters === 'excluded') return 'excluded'
    added.push(...filters)
  }
  return added.length ? { ...sheet, filters: [...sheet.filters, ...added] } : sheet
}

/** Turns the sheet's Use as Filter on (a filter action to every other sheet, run on Select) or off. */
export function toggleUseAsFilter(workbook: Workbook, source: number): Workbook {
  const actions = workbook.dashboard.actions
  const on = actions.some((a) => a.useAsFilter && a.source === source)
  const next = on
    ? actions.filter((a) => !(a.useAsFilter && a.source === source))
    : [
        ...actions,
        ...workbook.sheets.flatMap((_, target) =>
          target === source ? [] : [{ name: `Filter from ${sheetName(source)}`, source, target, run: 'select' as const, clearing: 'all' as const, useAsFilter: true }],
        ),
      ]
  return { ...workbook, dashboard: { ...workbook.dashboard, actions: next } }
}

export const usesAsFilter = (workbook: Workbook, source: number) => workbook.dashboard.actions.some((a) => a.useAsFilter && a.source === source)

/** A name for a new action that no other action has. */
export function newActionName(workbook: Workbook): string {
  const taken = new Set(workbook.dashboard.actions.map((a) => a.name))
  let n = 1
  while (taken.has(`Filter ${n}`)) n++
  return `Filter ${n}`
}

// ---- the URL hash ----

/** `#spec=` while only Sheet 1 is in use (so older links and lesson presets still work), else `#wb=`. */
export function workbookHash(workbook: Workbook): string {
  const [first, second] = workbook.sheets
  const empty = JSON.stringify(compactSpec(emptySpec(first!.source)))
  if (JSON.stringify(compactSpec(second!)) === empty && workbook.dashboard.actions.length === 0 && workbook.dashboard.layout === 'horizontal')
    return `#spec=${encodeURIComponent(JSON.stringify(compactSpec(first!)))}`
  const doc = {
    sheets: workbook.sheets.map(compactSpec),
    ...((workbook.dashboard.actions.length > 0 || workbook.dashboard.layout !== 'horizontal') && { dashboard: workbook.dashboard }),
  }
  return `#wb=${encodeURIComponent(JSON.stringify(doc))}`
}

const DAMAGED = 'This link’s workbook is damaged, so the sandbox starts empty.'

/** Reads a `#wb=` hash: undefined when there is none, an Error when it can't be read. */
export function parseWorkbookHash(hash: string): Workbook | Error | undefined {
  const m = /^#wb=(.*)$/.exec(hash)
  if (!m) return undefined
  try {
    const result = workbookSchema.safeParse(JSON.parse(decodeURIComponent(m[1]!)))
    return result.success ? result.data : new Error(DAMAGED)
  } catch {
    return new Error(DAMAGED)
  }
}
