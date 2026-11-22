// The viz spec: what the sandbox edits, what `viz` items and lesson embeds
// show, and what challenge checkpoints query (PLAN.md §6b, §7a). It mirrors a
// Tableau worksheet: shelves of pills plus the Marks card. Field names are
// checked against the data model separately, so this file stays data-free.
import { z } from 'zod'

export const AGGREGATIONS = ['sum', 'avg', 'median', 'count', 'countd', 'min', 'max', 'attr'] as const
export type Aggregation = (typeof AGGREGATIONS)[number]

/** `weekday` exists only as a date part; the others work as parts and as values. */
export const DATE_LEVELS = ['year', 'quarter', 'month', 'week', 'day', 'weekday'] as const
export type DateLevel = (typeof DATE_LEVELS)[number]

export const MARK_TYPES = ['automatic', 'bar', 'line', 'area', 'circle', 'square', 'shape', 'text', 'map', 'density'] as const
export type MarkType = (typeof MARK_TYPES)[number]

const fieldName = z.string().trim().min(1)

export const pillSchema = z
  .object({
    field: fieldName,
    /** Set for a measure (or an aggregated dimension, e.g. COUNTD of an id). */
    agg: z.enum(AGGREGATIONS).optional(),
    /** Date fields only: a discrete date part (YEAR, MONTH…) or a continuous date value (truncation). */
    date: z.object({ level: z.enum(DATE_LEVELS), mode: z.enum(['part', 'value']) }).optional(),
    /** Overrides the default: date parts and dimensions are discrete, date values and measures continuous. */
    as: z.enum(['discrete', 'continuous']).optional(),
    /**
     * Discrete pills only. Without `field` the members sort by their own value
     * (data source order); with `field` + `agg` it is a computed sort by that
     * measure; `manual` lists members first in the given order.
     */
    sort: z
      .object({
        order: z.enum(['asc', 'desc']).default('asc'),
        field: fieldName.optional(),
        agg: z.enum(AGGREGATIONS).optional(),
        manual: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .refine((p) => !(p.date?.level === 'weekday' && p.date.mode === 'value'), 'weekday is a date part only')

export type Pill = z.infer<typeof pillSchema>

const filterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('values'), field: fieldName, values: z.array(z.string()).min(1), exclude: z.boolean().optional() }),
  z.object({ kind: z.literal('range'), field: fieldName, agg: z.enum(AGGREGATIONS).optional(), min: z.number().optional(), max: z.number().optional() }),
  z.object({ kind: z.literal('dateRange'), field: fieldName, from: z.iso.date().optional(), to: z.iso.date().optional() }),
  z.object({ kind: z.literal('datePart'), field: fieldName, level: z.enum(DATE_LEVELS), values: z.array(z.union([z.string(), z.number()])).min(1) }),
])

export type Filter = z.infer<typeof filterSchema>

/** The engine's data sources (PLAN.md §6b): one row per session, subscriber or title. */
export const SOURCES = ['sessions', 'subscribers', 'titles'] as const
export type SourceId = (typeof SOURCES)[number]

export const vizSpecSchema = z.object({
  source: z.enum(SOURCES).default('sessions'),
  columns: z.array(pillSchema).default([]),
  rows: z.array(pillSchema).default([]),
  marks: z
    .object({
      type: z.enum(MARK_TYPES).default('automatic'),
      color: pillSchema.optional(),
      size: pillSchema.optional(),
      label: pillSchema.optional(),
      shape: pillSchema.optional(),
      detail: z.array(pillSchema).default([]),
      tooltip: z.array(pillSchema).default([]),
    })
    .prefault({}),
  filters: z.array(filterSchema).default([]),
})

export type VizSpec = z.infer<typeof vizSpecSchema>

/** Every pill in a spec, for field checks. */
export const pillsOf = (spec: VizSpec): Pill[] => [
  ...spec.columns,
  ...spec.rows,
  ...[spec.marks.color, spec.marks.size, spec.marks.label, spec.marks.shape].filter((p): p is Pill => p !== undefined),
  ...spec.marks.detail,
  ...spec.marks.tooltip,
]
