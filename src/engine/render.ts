// Turns a spec and its query result into a Vega-Lite spec (PLAN.md §6b), using
// Tableau's shelf rules: the innermost pill on Columns/Rows becomes the x/y
// axis (a continuous pill) or a band of headers (a discrete one), and the
// discrete pills before it split the view into panes. The Marks card maps to
// encodings, and the Automatic mark type follows Tableau's defaults.
import type { TopLevelSpec } from 'vega-lite'
import { COUNTRIES } from '../data/geography.ts'
import type { Row } from './model.ts'
import { EngineError, resolvePill } from './pills.ts'
import type { Column, QueryResult } from './query.ts'
import type { MarkType, Pill, VizSpec } from './spec.ts'

export interface Theme {
  text: string
  muted: string
  grid: string
  land: string
}

export const LIGHT_THEME: Theme = { text: '#334155', muted: '#64748b', grid: '#e2e8f0', land: '#e2e8f0' }

/** A world-atlas TopoJSON topology (countries-110m), needed for maps only. */
export type Topology = { type: 'Topology'; objects: Record<string, unknown> }

type Obj = Record<string, unknown>

// Built as plain objects: Vega-Lite's types are too strict for incremental assembly.
const SCHEMA = 'https://vega.github.io/schema/vega-lite/v6.json'
const topLevel = (spec: Obj) => ({ $schema: SCHEMA, ...spec }) as unknown as TopLevelSpec

const TIME_FORMAT: Record<string, string> = { year: '%Y', quarter: 'Q%q %Y', month: '%b %Y', week: '%b %d, %Y', day: '%b %d, %Y' }
const NUMBER_FORMAT = ',.2~f'

type AxisPill = Pick<Column, 'field' | 'continuous' | 'date'>

/** Which mark Tableau's Automatic would draw (PLAN.md §7a), from the innermost pills on Columns and Rows. */
export function automaticMark(x: AxisPill | undefined, y: AxisPill | undefined): Exclude<MarkType, 'automatic'> {
  if (x?.field.geo === 'longitude' && y?.field.geo === 'latitude') return 'circle'
  const xc = x?.continuous ?? false
  const yc = y?.continuous ?? false
  if (!xc && !yc) return 'text'
  if ((xc && x!.date) || (yc && y!.date)) return 'line'
  if (xc && yc) return 'circle'
  return 'bar'
}

function encodingOf(c: Column, extra: Obj = {}): Obj {
  const base: Obj = { field: c.id, title: c.label }
  if (!c.continuous) return { ...base, type: 'ordinal', sort: c.order, ...extra }
  if (c.date) return { ...base, type: 'temporal', scale: { type: 'utc' }, ...extra }
  return { ...base, type: 'quantitative', ...extra }
}

/** Axis format of a positional encoding. */
function axisOf(c: Column): Obj | undefined {
  if (!c.continuous) return undefined
  if (c.date) return { format: TIME_FORMAT[c.date.level], formatType: 'utc' }
  return { format: NUMBER_FORMAT }
}

function tooltipOf(c: Column): Obj {
  const t: Obj = { field: c.id, title: c.label, type: !c.continuous ? 'nominal' : c.date ? 'temporal' : 'quantitative' }
  if (c.continuous && c.date) Object.assign(t, { format: TIME_FORMAT[c.date.level], formatType: 'utc' })
  else if (c.continuous) t.format = NUMBER_FORMAT
  return t
}

/** Joins several discrete pills into one facet field, e.g. "2025 · Q1". */
function combine(rows: Row[], cols: Column[], id: string): { field: Obj | undefined; rows: Row[] } {
  if (cols.length === 0) return { field: undefined, rows }
  if (cols.length === 1) return { field: encodingOf(cols[0]!, { header: { labelOrient: 'top', titleOrient: 'top' } }), rows }
  const label = (r: Row) => cols.map((c) => String(r[c.id])).join(' · ')
  const order: string[] = []
  const walk = (i: number, prefix: string[]) => {
    if (i === cols.length) return order.push(prefix.join(' · '))
    for (const m of cols[i]!.order ?? []) walk(i + 1, [...prefix, m])
  }
  walk(0, [])
  const present = new Set(rows.map(label))
  return {
    field: { field: id, type: 'ordinal', sort: order.filter((o) => present.has(o)), title: cols.map((c) => c.label).join(' · '), header: { labelOrient: 'top', titleOrient: 'top' } },
    rows: rows.map((r) => ({ ...r, [id]: label(r) })),
  }
}

function shelf(spec: VizSpec, result: QueryResult, pills: Pill[], name: string): { inner?: Column; outer: Column[] } {
  const cols = pills.map((p) => {
    const key = resolvePill(spec, p).key
    return result.columns.find((c) => c.key === key)!
  })
  const outer = cols.slice(0, -1)
  if (outer.some((c) => c.continuous))
    throw new EngineError(`Only the last pill on ${name} can be continuous here: move the green pill to the end, or make it discrete.`)
  return { inner: cols.at(-1), outer }
}

/** Whether the spec draws a map, so the world shapes must be loaded first. */
export function needsWorld(spec: VizSpec): boolean {
  const geo = (p: Pill | undefined) => (p ? resolvePill(spec, p).field.geo : undefined)
  return geo(spec.columns.at(-1)) === 'longitude' && geo(spec.rows.at(-1)) === 'latitude'
}

const ISO_BY_COUNTRY = new Map(COUNTRIES.map((c) => [c.country, c.iso]))

export function toVegaLite(spec: VizSpec, result: QueryResult, options: { theme?: Theme; world?: Topology } = {}): TopLevelSpec {
  const theme = options.theme ?? LIGHT_THEME
  const col = (p: Pill | undefined) => (p ? result.columns.find((c) => c.key === resolvePill(spec, p).key) : undefined)
  const { inner: x, outer: xOuter } = shelf(spec, result, spec.columns, 'Columns')
  const { inner: y, outer: yOuter } = shelf(spec, result, spec.rows, 'Rows')
  const isGeo = x?.field.geo === 'longitude' && y?.field.geo === 'latitude'
  const mark = spec.marks.type === 'automatic' ? automaticMark(x, y) : spec.marks.type
  if (mark === 'map' && !isGeo) throw new EngineError('A map needs Longitude on Columns and Latitude on Rows.')

  const enc: Obj = {}
  if (isGeo) {
    enc.longitude = { field: x!.id, type: 'quantitative' }
    enc.latitude = { field: y!.id, type: 'quantitative' }
  } else {
    if (x) enc.x = encodingOf(x, { axis: axisOf(x) ?? { labelAngle: 0, labelLimit: 116 } })
    if (y) enc.y = encodingOf(y, { axis: axisOf(y) ?? {} })
  }
  const color = col(spec.marks.color)
  if (color) enc.color = encodingOf(color, { scale: color.continuous ? { scheme: 'blues' } : { scheme: 'tableau10' } })
  const size = col(spec.marks.size)
  if (size) enc.size = encodingOf(size)
  const shape = col(spec.marks.shape)
  if (shape) enc.shape = encodingOf(shape)
  const detail = spec.marks.detail.map(col).filter((c): c is Column => c !== undefined)
  if (detail.length) enc.detail = detail.map((c) => ({ field: c.id, type: c.continuous ? 'quantitative' : 'nominal' }))
  enc.tooltip = result.columns.map(tooltipOf)
  const label = col(spec.marks.label)
  const labelEnc = label ? { ...tooltipOf(label), title: undefined } : undefined

  const bothDiscrete = !x?.continuous && !y?.continuous
  const inCells = bothDiscrete && (mark === 'text' || mark === 'square')
  let markDef: Obj
  switch (mark) {
    case 'bar':
    case 'line':
    case 'area':
      markDef = { type: mark }
      break
    case 'circle':
      markDef = { type: 'circle', size: 60, opacity: 0.8 }
      break
    case 'square':
      // Two discrete shelves: squares fill their cells, as in a highlight table.
      markDef = bothDiscrete ? { type: 'rect' } : { type: 'square', size: 60 }
      break
    case 'shape':
      markDef = { type: 'point', filled: false, size: 60 }
      break
    case 'density':
      // Vega-Lite has no density mark; overlapping translucent circles approximate one.
      markDef = { type: 'circle', size: 140, opacity: 0.08, color: '#c2410c' }
      break
    case 'map':
      markDef = { type: 'geoshape' }
      break
    case 'text':
      markDef = { type: 'text', color: theme.text }
      // Without a measure on Label, Tableau's text marks read "Abc".
      enc.text = labelEnc ?? { value: 'Abc' }
      break
  }

  const layers: Obj[] = []
  if (mark !== 'map') layers.push({ mark: markDef, encoding: enc })
  if (labelEnc && mark !== 'text' && mark !== 'map') {
    const horizontal = x?.continuous && !y?.continuous
    const { color: _c, size: _s, shape: _sh, tooltip: _t, ...positional } = enc
    const placement = inCells
      ? { align: 'center', baseline: 'middle' }
      : horizontal
        ? { align: 'left', dx: 3 }
        : { baseline: 'bottom', dy: -3 }
    const encoding: Obj = { ...positional, text: labelEnc }
    // The blue scale is the same in both themes, so highlight-table labels
    // follow the cell, not the theme: white on the darkest cells, dark elsewhere.
    if (inCells && color?.continuous) {
      const max = Math.max(...result.rows.map((r) => (typeof r[color.id] === 'number' ? (r[color.id] as number) : -Infinity)))
      encoding.color = { condition: { test: `datum.${color.id} > ${max * 0.65}`, value: 'white' }, value: '#1e293b' }
    }
    layers.push({ mark: { type: 'text', color: theme.text, ...placement }, encoding })
  }

  let rows = result.rows
  const config: Obj = {
    background: null,
    font: 'system-ui, sans-serif',
    axis: { labelColor: theme.muted, titleColor: theme.text, gridColor: theme.grid, domainColor: theme.grid, tickColor: theme.grid },
    header: { labelColor: theme.text, titleColor: theme.text },
    legend: { labelColor: theme.muted, titleColor: theme.text },
    view: { stroke: theme.grid },
    title: { color: theme.text },
  }

  if (isGeo) {
    if (xOuter.length || yOuter.length) throw new EngineError('Maps can’t be split into panes here: remove the extra pills from Columns and Rows.')
    if (!options.world) throw new EngineError('The world map is still loading.')
    const world = (feature: string) => ({ values: options.world, format: { type: 'topojson', feature } })
    const geoLayers: Obj[] = [{ data: world('countries'), mark: { type: 'geoshape', fill: theme.land, stroke: theme.grid } }]
    if (mark === 'map') {
      const country = detail.concat(color ? [color] : []).find((c) => c.field.geo === 'country')
      if (!country) throw new EngineError('A filled map needs Country on Detail or Color (only countries have shapes here).')
      rows = rows.map((r) => ({ ...r, __iso: ISO_BY_COUNTRY.get(String(r[country.id])) ?? null }))
      const fields = result.columns.map((c) => c.id)
      const { longitude: _lo, latitude: _la, detail: _d, ...rest } = enc
      geoLayers.push({
        data: world('countries'),
        transform: [{ lookup: 'id', from: { data: { values: rows }, key: '__iso', fields } }, { filter: `datum.${country.id} != null` }],
        mark: { type: 'geoshape', stroke: theme.grid },
        encoding: rest,
      })
    } else geoLayers.push(...layers.map((l) => ({ ...l, data: { values: rows } })))
    return topLevel({ width: 640, height: 340, projection: { type: 'equalEarth' }, layer: geoLayers, config })
  }

  const fx = combine(rows, xOuter, '__col')
  const fy = combine(fx.rows, yOuter, '__row')
  rows = fy.rows
  // Bands as wide as their longest header, or the widest number in a text table.
  const numberChars = label && inCells ? Math.max(...rows.map((r) => (typeof r[label.id] === 'number' ? (r[label.id] as number).toLocaleString('en').length : 1))) : 0
  const step = Math.min(120, Math.max(28, 7 * Math.max(...(x?.order ?? ['']).map((m) => m.length), numberChars) + 14))
  const size2d: Obj = {
    width: x?.continuous ? 420 : x ? { step } : Math.max(120, 7 * numberChars + 14),
    height: y?.continuous ? 260 : y ? { step: 24 } : 40,
  }
  const view = layers.length === 1 ? layers[0]! : { layer: layers }
  if (fx.field || fy.field) {
    return topLevel({
      data: { values: rows },
      facet: { ...(fx.field && { column: fx.field }), ...(fy.field && { row: fy.field }) },
      spec: { ...size2d, ...view },
      config,
    })
  }
  return topLevel({ data: { values: rows }, ...size2d, ...view, config })
}
