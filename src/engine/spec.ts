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

/**
 * The quick table calculations whose results the help defines (Running total
 * sums). YTD total, Compound growth rate, Year over year growth and YTD growth
 * aren't defined there, so they are left out (PLAN.md §10).
 */
export const TABLE_CALCS = ['runningTotal', 'difference', 'percentDifference', 'percentOfTotal', 'rank', 'percentile', 'movingAverage'] as const
export type TableCalcType = (typeof TABLE_CALCS)[number]

/** Compute Using, as the help lists it (it lists no plain Pane (across)), then Cell. */
export const COMPUTE_USING = ['tableAcross', 'tableDown', 'tableAcrossDown', 'tableDownAcross', 'paneDown', 'paneAcrossDown', 'paneDownAcross', 'cell'] as const
export type ComputeUsing = (typeof COMPUTE_USING)[number]

export const TOTAL_AGGS = ['automatic', 'sum', 'avg', 'min', 'max'] as const
export type TotalAgg = (typeof TOTAL_AGGS)[number]

/**
 * Without `field` the members sort by their own value (data source order);
 * with `field` + `agg` it is a computed sort by that measure; `manual` lists
 * members (underlying values, before aliases) first in the given order.
 */
const sortSchema = z.object({
  order: z.enum(['asc', 'desc']).default('asc'),
  field: fieldName.optional(),
  agg: z.enum(AGGREGATIONS).optional(),
  manual: z.array(z.string()).optional(),
})

export type Sort = z.infer<typeof sortSchema>

export const pillSchema = z
  .object({
    field: fieldName,
    /** Set for a measure (or an aggregated dimension, e.g. COUNTD of an id). */
    agg: z.enum(AGGREGATIONS).optional(),
    /** Date fields only: a discrete date part (YEAR, MONTH…) or a continuous date value (truncation). */
    date: z.object({ level: z.enum(DATE_LEVELS), mode: z.enum(['part', 'value']) }).optional(),
    /** Overrides the default: date parts and dimensions are discrete, date values and measures continuous. */
    as: z.enum(['discrete', 'continuous']).optional(),
    /** A measure's own mark type when a shelf holds several measures (each has its own Marks card). */
    mark: z.enum(MARK_TYPES).optional(),
    /** A set pill shows In/Out by default; `members` shows the members in the set instead (Show Members in Set). */
    setView: z.literal('members').optional(),
    /** Discrete pills only; overrides the field's default sort. */
    sort: sortSchema.optional(),
    /** A quick table calculation on a measure; without `compute`, the engine picks Compute Using from the view. */
    tableCalc: z.object({ type: z.enum(TABLE_CALCS), compute: z.enum(COMPUTE_USING).optional() }).optional(),
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

/** A calculated field: Analysis > Create Calculated Field, kept with the sheet so links stay self-contained. */
export const calcSchema = z.object({ name: fieldName, formula: z.string().trim().min(1) })
export type Calc = z.infer<typeof calcSchema>

export const FIELD_TYPES = ['string', 'number', 'date', 'datetime', 'boolean'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export const GEO_ROLES = ['country', 'state', 'city', 'postal', 'latitude', 'longitude'] as const
export type GeoRole = (typeof GEO_ROLES)[number]

/** Default Properties > Number Format, the Number (Custom), Currency (Custom) and Percentage choices. */
export const numberFormatSchema = z.object({
  kind: z.enum(['number', 'currency', 'percent']).default('number'),
  decimals: z.number().int().min(0).max(6).default(0),
  /** Display units: 20,000 in thousands shows as 20K. */
  units: z.enum(['', 'K', 'M']).default(''),
  separators: z.boolean().default(true),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
})

export type NumberFormat = z.infer<typeof numberFormatSchema>

/**
 * A Data pane change to one of the source's fields, kept with the sheet like
 * calcs. `field` is the data source's name; everything else names the field
 * by its current name (`name` once renamed).
 */
export const fieldEditSchema = z.object({
  field: fieldName,
  name: fieldName.optional(),
  type: z.enum(FIELD_TYPES).optional(),
  /** `null` removes the field's geographic role. */
  geo: z.enum(GEO_ROLES).nullable().optional(),
  role: z.enum(['dimension', 'measure']).optional(),
  as: z.enum(['discrete', 'continuous']).optional(),
  /** Member (display string of the underlying value) → alias. */
  aliases: z.record(z.string(), z.string()).optional(),
  agg: z.enum(AGGREGATIONS).optional(),
  format: numberFormatSchema.optional(),
  sort: sortSchema.optional(),
  comment: z.string().optional(),
})

export type FieldEdit = z.infer<typeof fieldEditSchema>

/** Create > Group: members of a dimension combined under new names; the rest keep theirs, or go to Other. */
export const groupSchema = z.object({
  name: fieldName,
  field: fieldName,
  groups: z.array(z.object({ name: fieldName, members: z.array(z.string()).min(1) })),
  /** Include 'Other': every member not in a group. */
  other: z.boolean().optional(),
})

export type Group = z.infer<typeof groupSchema>

export const SET_OPS = ['>', '>=', '<', '<=', '=', '<>'] as const

/**
 * Create > Set on one dimension. `members`: the General tab, or a fixed set
 * made from marks (`fixed`); `condition` and `top` are dynamic and are
 * computed over the whole data source.
 */
export const setSchema = z.object({
  name: fieldName,
  field: fieldName,
  fixed: z.boolean().optional(),
  rule: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('members'), members: z.array(z.string()), exclude: z.boolean().optional() }),
    z.object({ kind: z.literal('condition'), field: fieldName, agg: z.enum(AGGREGATIONS), op: z.enum(SET_OPS), value: z.number() }),
    z.object({ kind: z.literal('top'), from: z.enum(['top', 'bottom']), n: z.number().int().min(1), field: fieldName, agg: z.enum(AGGREGATIONS) }),
  ]),
})

export type SetDef = z.infer<typeof setSchema>

/** Create > Bins on a measure: a dimension of equal ranges, lower limit inclusive. */
export const binSchema = z.object({ name: fieldName, field: fieldName, size: z.number().positive() })

export type Bin = z.infer<typeof binSchema>

/** A hierarchy of dimensions, from general to detailed, for drilling down and up. */
export const hierarchySchema = z.object({ name: fieldName, fields: z.array(fieldName).min(1) })

export type Hierarchy = z.infer<typeof hierarchySchema>

/** A reference line's computation: Constant, or one over the marks in its scope (Total over their underlying rows). */
export const REF_AGGS = ['total', 'sum', 'min', 'max', 'avg', 'median'] as const
export type RefAgg = (typeof REF_AGGS)[number]

const refValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('constant'), value: z.number() }),
  z.object({ kind: z.literal('computed'), agg: z.enum(REF_AGGS) }),
])

export type RefValue = z.infer<typeof refValueSchema>

const refBase = z.object({
  /** The measure whose axis it is on: a continuous measure on Columns or Rows. */
  measure: pillSchema,
  /** "The terms Table, Pane, and Cell define the scope." */
  scope: z.enum(['table', 'pane', 'cell']),
  label: z.enum(['none', 'value', 'computation', 'custom']).default('computation'),
  /** Custom label text; `<Value>` stands for the line's value. */
  custom: z.string().optional(),
})

/**
 * A reference line, band or distribution from the Analytics pane. A
 * distribution shades between its outermost values and draws a line at each:
 * percentages of a computation, percentiles of the marks, quantiles (3 to 10
 * tiles) or standard deviations around the mean.
 */
export const refSchema = z.discriminatedUnion('kind', [
  refBase.extend({ kind: z.literal('line'), value: refValueSchema }),
  refBase.extend({ kind: z.literal('band'), from: refValueSchema, to: refValueSchema }),
  refBase.extend({
    kind: z.literal('distribution'),
    dist: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('percentages'), values: z.array(z.number()).min(1), agg: z.enum(REF_AGGS) }),
      z.object({ kind: z.literal('percentiles'), values: z.array(z.number().min(0).max(100)).min(1) }),
      z.object({ kind: z.literal('quantiles'), n: z.number().int().min(3).max(10) }),
      z.object({ kind: z.literal('stddev'), factor: z.number().positive(), sample: z.boolean() }),
    ]),
  }),
])

export type Ref = z.infer<typeof refSchema>

export const vizSpecSchema = z.object({
  source: z.enum(SOURCES).default('sessions'),
  /** Checked against the data model by the engine, like field names. */
  calcs: z.array(calcSchema).default([]),
  /** Renames, aliases, types and default properties of the source's fields. */
  fields: z.array(fieldEditSchema).default([]),
  groups: z.array(groupSchema).default([]),
  sets: z.array(setSchema).default([]),
  bins: z.array(binSchema).default([]),
  hierarchies: z.array(hierarchySchema).default([]),
  /** The Measure Values card: the measures Measure Values and Measure Names stand for, in order. */
  measureValues: z.array(pillSchema).default([]),
  /** Dual Axis (the last two measures on the shelf share the pane, each with its own axis) and Synchronize Axis. */
  axes: z
    .object({
      columns: z.object({ dual: z.boolean().optional(), sync: z.boolean().optional() }).optional(),
      rows: z.object({ dual: z.boolean().optional(), sync: z.boolean().optional() }).optional(),
    })
    .default({}),
  /**
   * Analysis > Totals: Row Grand Totals (a Grand Total column at the right),
   * Column Grand Totals (a row at the bottom), subtotals for the outer headers,
   * and Total All Using (Automatic totals the underlying rows; the others
   * aggregate the marks).
   */
  totals: z
    .object({ row: z.boolean().optional(), column: z.boolean().optional(), subtotals: z.boolean().optional(), using: z.enum(TOTAL_AGGS).optional() })
    .default({}),
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
  /** Reference lines, bands and distributions. */
  refs: z.array(refSchema).default([]),
})

export type VizSpec = z.infer<typeof vizSpecSchema>

/** Tableau's generated fields for several measures at once (a combined axis, a table of measures). */
export const MEASURE_NAMES = 'Measure Names'
export const MEASURE_VALUES = 'Measure Values'

/** Every pill in the view (not the Measure Values card), for field checks and query columns. */
export const pillsOf = (spec: VizSpec): Pill[] => [
  ...spec.columns,
  ...spec.rows,
  ...[spec.marks.color, spec.marks.size, spec.marks.label, spec.marks.shape].filter((p): p is Pill => p !== undefined),
  ...spec.marks.detail,
  ...spec.marks.tooltip,
]
