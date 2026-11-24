// The sandbox's Analytics pane: items dragged into the view (or added from
// their menus) that add reference lines, bands, distributions and totals.
// Dropping one asks for its target, as Tableau shows Table, Pane and Cell
// drop areas (and one set per measure when the view has several).
import { axisMeasures, setRef, setTotals } from '../engine/edit'
import { resolvePill } from '../engine/pills'
import { REF_AGG_NAME } from '../engine/refs'
import type { Pill, Ref, VizSpec } from '../engine/spec'
import { startDrag } from './dnd'
import { MenuButton, MenuHeading, MenuItem } from './Menu'

export type AnalyticsItem = 'constant' | 'average' | 'medianQuartiles' | 'totals' | 'refLine' | 'refBand' | 'distribution'

const ITEMS: { section: string; items: [AnalyticsItem, string][] }[] = [
  {
    section: 'Summarize',
    items: [
      ['constant', 'Constant Line'],
      ['average', 'Average Line'],
      ['medianQuartiles', 'Median with Quartiles'],
      ['totals', 'Totals'],
    ],
  },
  {
    section: 'Custom',
    items: [
      ['refLine', 'Reference Line'],
      ['refBand', 'Reference Band'],
      ['distribution', 'Distribution Band'],
    ],
  },
]

export const ITEM_NAME = Object.fromEntries(ITEMS.flatMap((s) => s.items)) as Record<AnalyticsItem, string>

const SCOPES: [Ref['scope'], string][] = [
  ['table', 'Table'],
  ['pane', 'Pane'],
  ['cell', 'Cell'],
]

/** What choosing a target does: change the spec, or open the reference dialog on a new item. */
export type TargetAction = { spec: VizSpec } | { open: Ref }

/** The new item for one measure and scope; the dialog's starting values where the help gives none are ours (PLAN.md §10). */
function newRefs(item: AnalyticsItem, measure: Pill, scope: Ref['scope']): Ref[] {
  const base = { measure, scope, label: 'computation' as const }
  switch (item) {
    case 'constant':
    case 'refLine':
      return [{ ...base, kind: 'line', value: item === 'constant' ? { kind: 'constant', value: 0 } : { kind: 'computed', agg: 'avg' } }]
    case 'average':
      return [{ ...base, kind: 'line', value: { kind: 'computed', agg: 'avg' } }]
    case 'medianQuartiles':
      // "Adds one or more sets of median lines and distribution bands … computed as quartiles."
      return [
        { ...base, kind: 'line', value: { kind: 'computed', agg: 'median' } },
        { ...base, kind: 'distribution', label: 'none', dist: { kind: 'quantiles', n: 4 } },
      ]
    case 'refBand':
      return [{ ...base, kind: 'band', label: 'none', from: { kind: 'computed', agg: 'min' }, to: { kind: 'computed', agg: 'max' } }]
    case 'distribution':
      return [{ ...base, kind: 'distribution', label: 'none', dist: { kind: 'percentages', values: [60, 80], agg: 'avg' } }]
    case 'totals':
      return []
  }
}

/** Items that open the dialog: a constant needs its value, the custom ones their settings. */
const OPENS_DIALOG: AnalyticsItem[] = ['constant', 'refLine', 'refBand', 'distribution']

/**
 * The drop targets of an item in this view, by heading: Totals' three, or
 * Table/Pane/Cell for each axis measure (and for all of them at once).
 */
export function targetsOf(spec: VizSpec, item: AnalyticsItem): { heading: string; targets: { label: string; action: () => TargetAction }[] }[] {
  if (item === 'totals') {
    return [
      {
        heading: 'Add Totals',
        targets: [
          { label: 'Subtotals', action: () => ({ spec: setTotals(spec, { subtotals: true }) }) },
          { label: 'Column Grand Totals', action: () => ({ spec: setTotals(spec, { column: true }) }) },
          { label: 'Row Grand Totals', action: () => ({ spec: setTotals(spec, { row: true }) }) },
        ],
      },
    ]
  }
  const measures = axisMeasures(spec)
  const groups: { heading: string; measures: Pill[] }[] = measures.map((m) => ({ heading: resolvePill(spec, m).label, measures: [m] }))
  if (measures.length > 1 && !OPENS_DIALOG.includes(item)) groups.unshift({ heading: 'All measures', measures })
  return groups.map((g) => ({
    heading: g.heading,
    targets: SCOPES.map(([scope, label]) => ({
      label,
      action: (): TargetAction => {
        if (OPENS_DIALOG.includes(item)) return { open: newRefs(item, g.measures[0]!, scope)[0]! }
        return { spec: g.measures.flatMap((m) => newRefs(item, m, scope)).reduce((s, r) => setRef(s, undefined, r), spec) }
      },
    })),
  }))
}

/** A reference item's short name for its chip. */
export function refName(spec: VizSpec, ref: Ref): string {
  let what: string
  if (ref.kind === 'line') what = ref.value.kind === 'constant' ? `Constant ${ref.value.value.toLocaleString('en')}` : `${REF_AGG_NAME[ref.value.agg]} line`
  else if (ref.kind === 'band') what = 'Band'
  else what = { percentages: 'Percentages', percentiles: 'Percentiles', quantiles: 'Quantiles', stddev: 'Standard deviation' }[ref.dist.kind]
  let measure: string
  try {
    measure = resolvePill(spec, ref.measure).label
  } catch {
    measure = ref.measure.field
  }
  return `${what} · ${measure} · ${ref.scope[0]!.toUpperCase()}${ref.scope.slice(1)}`
}

export function AnalyticsPane({ spec, onAction }: { spec: VizSpec; onAction: (a: TargetAction) => void }) {
  const noAxis = axisMeasures(spec).length === 0
  return (
    <div className="space-y-3">
      {ITEMS.map(({ section, items }) => (
        <div key={section}>
          <h3 className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{section}</h3>
          <ul className="mt-1">
            {items.map(([id, name]) => {
              const groups = targetsOf(spec, id)
              return (
                <li key={id}>
                  <MenuButton
                    menuLabel={name}
                    draggable
                    onDragStart={(e) => startDrag(e, { kind: 'analytics', item: id })}
                    label={name}
                    className="w-full cursor-grab rounded px-1.5 py-0.5 text-left text-sm hover:bg-slate-100"
                  >
                    {(close) => (
                      <>
                        {groups.length === 0 && <p className="px-3 py-1 text-xs text-slate-500">Put a measure on Columns or Rows first: reference lines go on a continuous axis.</p>}
                        {groups.map((g) => (
                          <div key={g.heading}>
                            <MenuHeading>{g.heading}</MenuHeading>
                            {g.targets.map((t) => (
                              <MenuItem
                                key={t.label}
                                onSelect={() => {
                                  close()
                                  onAction(t.action())
                                }}
                              >
                                {t.label}
                              </MenuItem>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </MenuButton>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {noAxis && <p className="px-1 text-xs text-slate-500">Reference lines need a continuous axis: put a measure on Columns or Rows.</p>}
    </div>
  )
}

/** After an item is dropped on the view: its targets, as Tableau's drop areas. */
export function DropTargets({ spec, item, onAction, onCancel }: { spec: VizSpec; item: AnalyticsItem; onAction: (a: TargetAction) => void; onCancel: () => void }) {
  const groups = targetsOf(spec, item)
  return (
    <section aria-label={`Add ${ITEM_NAME[item]}`} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">Add {ITEM_NAME[item]}</h3>
      {groups.length === 0 && <p className="text-slate-500">Put a measure on Columns or Rows first: reference lines go on a continuous axis.</p>}
      {groups.map((g) => (
        <div key={g.heading} role="group" aria-label={g.heading} className="flex flex-wrap items-center gap-2">
          <span className="w-48 text-slate-600">{g.heading}</span>
          {g.targets.map((t) => (
            <button key={t.label} type="button" onClick={() => onAction(t.action())} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">
              {t.label}
            </button>
          ))}
        </div>
      ))}
      <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
        Cancel
      </button>
    </section>
  )
}
