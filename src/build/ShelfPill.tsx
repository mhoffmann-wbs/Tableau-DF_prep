import {
  CHANNELS,
  LIST_SHELVES,
  type PillAt,
  SHELF_LABEL,
  aggregationChoices,
  canToggleContinuity,
  drillDown,
  drillState,
  drillUp,
  movePill,
  pillAt,
  removePill,
  replacePill,
  withAggregation,
  withContinuity,
  withDateLevel,
} from '../engine/edit'
import { EngineError, type ResolvedPill, resolvePill } from '../engine/pills'
import type { Aggregation, DateLevel, Pill, VizSpec } from '../engine/spec'
import { startDrag, useDropTarget } from './dnd'
import { MenuButton, MenuHeading, MenuItem } from './Menu'

export const AGG_NAME: Record<Aggregation, string> = {
  sum: 'Sum',
  avg: 'Average',
  median: 'Median',
  count: 'Count',
  countd: 'Count (Distinct)',
  min: 'Minimum',
  max: 'Maximum',
  attr: 'Attribute',
}

const PART_LEVELS: [DateLevel, string][] = [
  ['year', 'Year'],
  ['quarter', 'Quarter'],
  ['month', 'Month'],
  ['week', 'Week Number'],
  ['day', 'Day'],
  ['weekday', 'Weekday'],
]
const VALUE_LEVELS = PART_LEVELS.filter(([l]) => l !== 'weekday').map(([l, name]): [DateLevel, string] => [l, l === 'week' ? 'Week' : name])

/** Members and In/Out sort differently, so a sort starts over. */
function withoutSetView(pill: Pill): Pill {
  const { setView: _v, sort: _s, ...rest } = pill
  return rest
}

/** A pill on a shelf: drag it to move it, or open its menu to change, move or remove it. */
export function ShelfPill({
  spec,
  at,
  onChange,
  onEditSort,
  onDropBefore,
}: {
  spec: VizSpec
  at: PillAt
  onChange: (next: VizSpec) => void
  onEditSort: (at: PillAt) => void
  /** List shelves: something dropped on this pill goes in before it. */
  onDropBefore?: Parameters<typeof useDropTarget>[0]
}) {
  const drop = useDropTarget(onDropBefore ?? (() => {}))
  const pill = pillAt(spec, at)!
  let rp: ResolvedPill | undefined
  let problem: string | undefined
  try {
    rp = resolvePill(spec, pill)
  } catch (e) {
    problem = e instanceof EngineError ? e.message : String(e)
  }
  const set = (next: Pill) => onChange(replacePill(spec, at, next))
  const where = SHELF_LABEL[at.shelf]
  const color = !rp ? 'bg-red-600' : rp.continuous ? 'bg-continuous' : 'bg-discrete'
  const drill = rp ? drillState(spec, at) : { up: false }

  return (
    <span {...(onDropBefore && drop.props)} className={`inline-flex items-center ${drop.over ? 'border-l-4 border-accent pl-1' : ''}`}>
      {(drill.up || drill.down) && (
        <button
          type="button"
          aria-label={drill.up ? `Drill up: collapse ${pill.field}` : `Drill down from ${pill.field} to ${drill.down}`}
          onClick={() => onChange(drill.up ? drillUp(spec, at) : drillDown(spec, at))}
          className={`-mr-1 h-5 w-5 rounded-full text-xs leading-none font-bold text-white ring-2 ring-white ${color}`}
        >
          {drill.up ? '−' : '+'}
        </button>
      )}
      <MenuButton
        menuLabel={`${rp?.label ?? pill.field} on ${where}`}
        draggable
        onDragStart={(e) => startDrag(e, { kind: 'pill', at })}
        title={problem}
        className={`cursor-grab rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${color}`}
        label={
          <>
            {rp?.label ?? `${pill.field} ?`}
            <span className="sr-only"> ({rp ? (rp.continuous ? 'continuous' : 'discrete') : 'broken'})</span>
            {pill.sort && <span aria-label=", sorted"> ⇅</span>}
          </>
        }
      >
        {(close) => {
          const act = (fn: () => void) => () => {
            fn()
            close()
          }
          const aggs = aggregationChoices(spec, pill)
          return (
            <>
              {problem && <p className="px-3 py-1 text-xs text-red-700">{problem}</p>}
              {aggs.length > 0 && <MenuHeading>{aggs[0] === undefined ? 'Dimension or measure' : 'Measure'}</MenuHeading>}
              {aggs.map((a) => (
                <MenuItem key={a ?? 'dimension'} checked={rp?.agg === a} onSelect={act(() => set(withAggregation(pill, a)))}>
                  {a ? AGG_NAME[a] : 'Dimension'}
                </MenuItem>
              ))}
              {rp?.date && (
                <>
                  <MenuHeading>Date part</MenuHeading>
                  {PART_LEVELS.map(([level, name]) => (
                    <MenuItem key={level} checked={rp.date!.mode === 'part' && rp.date!.level === level} onSelect={act(() => set(withDateLevel(pill, level, 'part')))}>
                      {name}
                    </MenuItem>
                  ))}
                  <MenuHeading>Date value</MenuHeading>
                  {VALUE_LEVELS.map(([level, name]) => (
                    <MenuItem key={level} checked={rp.date!.mode === 'value' && rp.date!.level === level} onSelect={act(() => set(withDateLevel(pill, level, 'value')))}>
                      {name}
                    </MenuItem>
                  ))}
                </>
              )}
              {rp && canToggleContinuity(spec, pill) && (
                <>
                  <MenuHeading>Display</MenuHeading>
                  <MenuItem checked={!rp.continuous} onSelect={act(() => set(withContinuity(spec, pill, false)))}>
                    Discrete
                  </MenuItem>
                  <MenuItem checked={rp.continuous} onSelect={act(() => set(withContinuity(spec, pill, true)))}>
                    Continuous
                  </MenuItem>
                </>
              )}
              {rp?.field.derived?.kind === 'set' && (
                <>
                  <MenuHeading>Set</MenuHeading>
                  <MenuItem checked={!pill.setView} onSelect={act(() => set(withoutSetView(pill)))}>
                    Show In/Out of Set
                  </MenuItem>
                  <MenuItem checked={pill.setView === 'members'} onSelect={act(() => set({ ...withoutSetView(pill), setView: 'members' }))}>
                    Show Members in Set
                  </MenuItem>
                </>
              )}
              {rp && !rp.continuous && (at.shelf === 'columns' || at.shelf === 'rows') && (
                <MenuItem onSelect={act(() => onEditSort(at))}>Sort…</MenuItem>
              )}
              <MenuHeading>Move to</MenuHeading>
              {[...LIST_SHELVES, ...CHANNELS]
                .filter((s) => s !== at.shelf)
                .map((s) => (
                  <MenuItem key={s} onSelect={act(() => onChange(movePill(spec, at, s)))}>
                    {SHELF_LABEL[s]}
                  </MenuItem>
                ))}
              <MenuHeading>Pill</MenuHeading>
              <MenuItem onSelect={act(() => onChange(removePill(spec, at)))}>Remove</MenuItem>
            </>
          )
        }}
      </MenuButton>
    </span>
  )
}
