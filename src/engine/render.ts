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
import { formatExpr, formatNumber } from './values.ts'

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

type AxisPill = Pick<Column, 'field' | 'continuous' | 'date' | 'kind'>

/**
 * Which mark Tableau's Automatic would draw (PLAN.md §7a), from the innermost
 * pills on Columns and Rows: Line for a date (part or value) and a measure,
 * Shape for a measure on both, Bar for a dimension and a measure, Text when
 * nothing is continuous.
 */
export function automaticMark(x: AxisPill | undefined, y: AxisPill | undefined): Exclude<MarkType, 'automatic'> {
  if (x?.field.geo === 'longitude' && y?.field.geo === 'latitude') return 'circle'
  const xc = x?.continuous ?? false
  const yc = y?.continuous ?? false
  if (!xc && !yc) return 'text'
  if ((xc && x!.date) || (yc && y!.date) || (x?.date && yc) || (y?.date && xc)) return 'line'
  // The help names Shape for measures on both shelves; a continuous dimension (no rule given) keeps Circle.
  if (xc && yc) return x!.kind === 'measure' && y!.kind === 'measure' ? 'shape' : 'circle'
  return 'bar'
}

function encodingOf(c: Column, extra: Obj = {}): Obj {
  const base: Obj = { field: c.id, title: c.label }
  if (!c.continuous) return { ...base, type: 'ordinal', sort: c.order, ...extra }
  if (c.date) return { ...base, type: 'temporal', scale: { type: 'utc' }, ...extra }
  return { ...base, type: 'quantitative', ...extra }
}

/** A continuous number column with a default number format: its formatted text sits in the rows as `<id>f`. */
const formatOf = (c: Column) => (c.continuous && !c.date ? c.field.format : undefined)

/** Axis format of a positional encoding. */
function axisOf(c: Column): Obj | undefined {
  if (!c.continuous) return undefined
  if (c.date) return { format: TIME_FORMAT[c.date.level], formatType: 'utc' }
  const f = formatOf(c)
  return f ? { labelExpr: formatExpr(f, 'datum.value') } : { format: NUMBER_FORMAT }
}

function tooltipOf(c: Column): Obj {
  if (formatOf(c)) return { field: `${c.id}f`, title: c.label, type: 'nominal' }
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

/**
 * A shelf's pills: discrete ones split the view into panes (`outer`), then
 * either one innermost pill (an axis or a band of headers) or several
 * continuous ones (`measures`: one pane each, or two on a dual axis).
 */
interface ShelfLayout {
  outer: Column[]
  inner?: Column
  measures: Column[]
}

function shelf(spec: VizSpec, result: QueryResult, pills: Pill[], name: string): ShelfLayout {
  const cols = pills.map((p) => {
    const key = resolvePill(spec, p).key
    return result.columns.find((c) => c.key === key)!
  })
  const first = cols.findIndex((c) => c.continuous)
  if (first < 0) return { outer: cols.slice(0, -1), inner: cols.at(-1), measures: [] }
  const rest = cols.slice(first)
  if (rest.some((c) => !c.continuous)) throw new EngineError(`On ${name}, put the discrete (blue) pills before the continuous (green) ones.`)
  return rest.length === 1 ? { outer: cols.slice(0, first), inner: rest[0], measures: [] } : { outer: cols.slice(0, first), measures: rest }
}

/** Colours of the two measures on a dual axis when nothing is on Color (the first two of the categorical scheme). */
const DUAL_COLORS = ['#4e79a7', '#f28e2b']

/** Whether the spec draws a map, so the world shapes must be loaded first. */
export function needsWorld(spec: VizSpec): boolean {
  const geo = (p: Pill | undefined) => (p ? resolvePill(spec, p).field.geo : undefined)
  return geo(spec.columns.at(-1)) === 'longitude' && geo(spec.rows.at(-1)) === 'latitude'
}

const ISO_BY_COUNTRY = new Map(COUNTRIES.map((c) => [c.country, c.iso]))

export function toVegaLite(spec: VizSpec, result: QueryResult, options: { theme?: Theme; world?: Topology } = {}): TopLevelSpec {
  const theme = options.theme ?? LIGHT_THEME
  const col = (p: Pill | undefined) => (p ? result.columns.find((c) => c.key === resolvePill(spec, p).key) : undefined)
  const X = shelf(spec, result, spec.columns, 'Columns')
  const Y = shelf(spec, result, spec.rows, 'Rows')
  if (X.measures.length && Y.measures.length) throw new EngineError('Several measures on both Columns and Rows can’t be drawn here: keep the extra measures on one shelf.')
  // The shelf with several measures, if any: measure panes, or a dual axis.
  const multi = X.measures.length ? 'columns' : Y.measures.length ? 'rows' : undefined
  const channel = multi === 'columns' ? 'x' : 'y'
  const measures = multi === 'columns' ? X.measures : Y.measures
  const dual = multi !== undefined && spec.axes[multi]?.dual === true
  if (dual && measures.length !== 2) throw new EngineError(`Dual Axis needs exactly two measures on ${multi === 'columns' ? 'Columns' : 'Rows'}.`)
  const ownMark = (c: Column) => (c.pill.mark && c.pill.mark !== 'automatic' ? c.pill.mark : undefined)
  /** A measure's mark: its own Marks card, else the sheet's, else Automatic's for its axes. */
  const markOf = (x: Column | undefined, y: Column | undefined, m?: Column) => {
    const t = (m && ownMark(m)) ?? spec.marks.type
    return t === 'automatic' ? automaticMark(x, y) : t
  }

  const formatted = result.columns.filter((c) => formatOf(c))
  let rows = formatted.length
    ? result.rows.map((r) => {
        const out = { ...r }
        for (const c of formatted) out[`${c.id}f`] = typeof r[c.id] === 'number' ? formatNumber(r[c.id] as number, formatOf(c)!) : 'Null'
        return out
      })
    : result.rows

  let x = X.inner
  let y = Y.inner
  const xOuter = [...X.outer]
  const yOuter = [...Y.outer]
  // Measure panes: the measures fold into one value column, split by a measure-name pane.
  let folded: { value: Column; byMark: Map<string, string[]> } | undefined
  if (multi && !dual) {
    const plain = (c: Column) => ({ ...c, field: { ...c.field, format: undefined } })
    const value: Column = { ...plain(measures[0]!), id: '__v', label: '' }
    const name: Column = { ...plain(measures[0]!), id: '__m', label: '', kind: 'dimension', continuous: false, date: undefined, order: measures.map((m) => m.label) }
    rows = rows.flatMap((r) => measures.map((m) => ({ ...r, __m: m.label, __v: r[m.id] ?? null })))
    if (multi === 'columns') {
      x = value
      xOuter.push(name)
    } else {
      y = value
      yOuter.push(name)
    }
    const byMark = new Map<string, string[]>()
    for (const m of measures) {
      const mk = markOf(multi === 'columns' ? m : x, multi === 'rows' ? m : y, m)
      byMark.set(mk, [...(byMark.get(mk) ?? []), m.label])
    }
    folded = { value, byMark }
  }

  const isGeo = x?.field.geo === 'longitude' && y?.field.geo === 'latitude'
  if (isGeo && multi) throw new EngineError('Maps can’t have several measures on a shelf here.')
  const mark = markOf(x, y)
  if (mark === 'map' && !isGeo) throw new EngineError('A map needs Longitude on Columns and Latitude on Rows.')

  // The Marks card's encodings, shared by every layer.
  const shared: Obj = {}
  const color = col(spec.marks.color)
  if (color) shared.color = encodingOf(color, { scale: color.continuous ? { scheme: 'blues' } : { scheme: 'tableau10' } })
  const size = col(spec.marks.size)
  if (size) shared.size = encodingOf(size)
  const shape = col(spec.marks.shape)
  if (shape) shared.shape = encodingOf(shape)
  const detail = spec.marks.detail.map(col).filter((c): c is Column => c !== undefined)
  if (detail.length) shared.detail = detail.map((c) => ({ field: c.id, type: c.continuous ? 'quantitative' : 'nominal' }))
  shared.tooltip = [...(folded ? [{ field: '__m', title: 'Measure', type: 'nominal' }] : []), ...result.columns.map(tooltipOf)]
  const label = col(spec.marks.label)
  const labelEnc = label ? { ...tooltipOf(label), title: undefined } : undefined
  // A dual axis has no single inner pill on its shelf, but it is an axis all the same.
  const xAxis = x?.continuous || (dual && multi === 'columns')
  const yAxis = y?.continuous || (dual && multi === 'rows')
  const bothDiscrete = !xAxis && !yAxis
  const inCells = bothDiscrete && (mark === 'text' || mark === 'square')

  /** The mark layer (and a label layer) for one pair of axes and one mark type. */
  const layersFor = (lx: Column | undefined, ly: Column | undefined, mk: Exclude<MarkType, 'automatic'>, opts: { filter?: string; fixedColor?: string } = {}): Obj[] => {
    const enc: Obj = { ...shared }
    if (isGeo) {
      enc.longitude = { field: lx!.id, type: 'quantitative' }
      enc.latitude = { field: ly!.id, type: 'quantitative' }
    } else {
      if (lx) enc.x = encodingOf(lx, { axis: axisOf(lx) ?? { labelAngle: 0, labelLimit: 116 }, ...(lx === folded?.value && { title: null }) })
      if (ly) enc.y = encodingOf(ly, { axis: axisOf(ly) ?? {}, ...(ly === folded?.value && { title: null }) })
    }
    const cells = !lx?.continuous && !ly?.continuous && (mk === 'text' || mk === 'square')
    let markDef: Obj
    switch (mk) {
      case 'bar':
      case 'line':
      case 'area':
        markDef = { type: mk }
        break
      case 'circle':
        markDef = { type: 'circle', size: 60, opacity: 0.8 }
        break
      case 'square':
        // Two discrete shelves: squares fill their cells, as in a highlight table.
        markDef = cells ? { type: 'rect' } : { type: 'square', size: 60 }
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
    if (opts.fixedColor && !color) markDef.color = opts.fixedColor
    const transform = opts.filter ? { transform: [{ filter: opts.filter }] } : {}
    const out: Obj[] = []
    if (mk !== 'map') out.push({ ...transform, mark: markDef, encoding: enc })
    if (labelEnc && mk !== 'text' && mk !== 'map') {
      const horizontal = lx?.continuous && !ly?.continuous
      const { color: _c, size: _s, shape: _sh, tooltip: _t, ...positional } = enc
      const placement = cells
        ? { align: 'center', baseline: 'middle' }
        : horizontal
          ? { align: 'left', dx: 3 }
          : { baseline: 'bottom', dy: -3 }
      const encoding: Obj = { ...positional, text: labelEnc }
      // The blue scale is the same in both themes, so highlight-table labels
      // follow the cell, not the theme: white on the darkest cells, dark elsewhere.
      if (cells && color?.continuous) {
        const max = Math.max(...result.rows.map((r) => (typeof r[color.id] === 'number' ? (r[color.id] as number) : -Infinity)))
        encoding.color = { condition: { test: `datum.${color.id} > ${max * 0.65}`, value: 'white' }, value: '#1e293b' }
      }
      out.push({ ...transform, mark: { type: 'text', color: theme.text, ...placement }, encoding })
    }
    return out
  }

  let layers: Obj[]
  let resolve: Obj | undefined
  if (dual) {
    const sync = spec.axes[multi!]?.sync === true
    layers = measures.flatMap((m, i) => {
      const [lx, ly] = multi === 'columns' ? [m, y] : [x, m]
      return layersFor(lx, ly, markOf(lx, ly, m), { fixedColor: DUAL_COLORS[i] })
    })
    // Two axes; Synchronize Axis gives them one scale.
    resolve = { scale: { [channel]: sync ? 'shared' : 'independent' }, axis: { [channel]: 'independent' } }
  } else if (folded && folded.byMark.size > 1) {
    layers = [...folded.byMark].flatMap(([mk, labels]) => layersFor(x, y, mk as Exclude<MarkType, 'automatic'>, { filter: `indexof(${JSON.stringify(labels)}, datum.__m) >= 0` }))
  } else layers = layersFor(x, y, folded ? ([...folded.byMark.keys()][0] as Exclude<MarkType, 'automatic'>) : mark)

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
      const fields = [...result.columns.map((c) => c.id), ...formatted.map((c) => `${c.id}f`)]
      geoLayers.push({
        data: world('countries'),
        transform: [{ lookup: 'id', from: { data: { values: rows }, key: '__iso', fields } }, { filter: `datum.${country.id} != null` }],
        mark: { type: 'geoshape', stroke: theme.grid },
        encoding: shared,
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
    width: xAxis ? (folded && multi === 'columns' ? 260 : 420) : x ? { step } : Math.max(120, 7 * numberChars + 14),
    height: yAxis ? (folded && multi === 'rows' ? 160 : 260) : y ? { step: 24 } : 40,
  }
  const view = layers.length === 1 ? layers[0]! : { layer: layers }
  if (fx.field || fy.field) {
    return topLevel({
      data: { values: rows },
      facet: { ...(fx.field && { column: fx.field }), ...(fy.field && { row: fy.field }) },
      spec: { ...size2d, ...view, ...(resolve && { resolve }) },
      // Measure panes each get their own axis.
      ...(folded && { resolve: { scale: { [channel]: 'independent' } } }),
      config,
    })
  }
  return topLevel({ data: { values: rows }, ...size2d, ...view, ...(resolve && { resolve }), config })
}
