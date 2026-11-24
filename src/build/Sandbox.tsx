import { type ReactNode, useState } from 'react'
import {
  CHANNELS,
  type ListShelf,
  type PillAt,
  SHELF_LABEL,
  type ShelfId,
  defaultFilter,
  emptySpec,
  isChannel,
  movePill,
  pillAt,
  pillFor,
  placePill,
  removeFilter,
  removeCalc,
  removePill,
  replacePill,
  setCalc,
  setFilter,
  setMarkType,
  usesField,
} from '../engine/edit'
import { type Field, fieldsOf, SOURCE_INFO } from '../engine/model'
import { AGG_LABEL, resolvePill } from '../engine/pills'
import { automaticMark } from '../engine/render'
import { type Calc, MARK_TYPES, type Filter, type MarkType, SOURCES, type SourceId, type VizSpec, pillsOf } from '../engine/spec'
import { Viz } from '../engine/Viz'
import { type Dragged, startDrag, useDropTarget } from './dnd'
import { FilterEditor } from './FilterEditor'
import { MenuButton, MenuHeading, MenuItem } from './Menu'
import { saveCalc, useProgress } from '../progress/store'
import { CalcEditor, calcStatus } from './CalcEditor'
import { ShelfPill } from './ShelfPill'
import { SortEditor } from './SortEditor'

type Editor = { kind: 'filter'; index: number; filter: Filter } | { kind: 'sort'; at: PillAt } | { kind: 'calc'; index?: number }

const MARK_NAME: Record<MarkType, string> = {
  automatic: 'Automatic',
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  circle: 'Circle',
  square: 'Square',
  shape: 'Shape',
  text: 'Text',
  map: 'Map',
  density: 'Density',
}

const card = 'rounded-lg border border-slate-200 bg-white'

/**
 * The viz builder: a Data pane, the Filters shelf, the Marks card, Columns and
 * Rows, and the view. It edits a spec it doesn't own: the page keeps it (in the
 * URL) and gets every change through `onChange`.
 */
export function Sandbox({ spec, onChange, lockSource = false }: { spec: VizSpec; onChange: (next: VizSpec) => void; lockSource?: boolean }) {
  const [editor, setEditor] = useState<Editor>()
  const edit = (next: VizSpec) => {
    setEditor(undefined)
    onChange(next)
  }
  /** Drops a field or a pill on a shelf, at `index` on list shelves. */
  const dropOn = (shelf: ShelfId, index?: number) => (d: Dragged) => {
    if (d.kind === 'pill') edit(movePill(spec, d.at, shelf, index))
    else edit(placePill(spec, pillFor(d.field), shelf, index))
  }
  const addFilter = (field: string) => {
    const filter = defaultFilter(spec, field)
    if (filter) setEditor({ kind: 'filter', index: spec.filters.length, filter })
  }
  const pillProps = { spec, onChange: edit, onEditSort: (at: PillAt) => setEditor({ kind: 'sort', at }) }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <DataPane spec={spec} onChange={edit} lockSource={lockSource} onAddFilter={addFilter} onEditCalc={(index) => setEditor({ kind: 'calc', index })} />
      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FiltersCard spec={spec} onDropField={addFilter} onEdit={(index) => setEditor({ kind: 'filter', index, filter: spec.filters[index]! })} />
          <MarksCard spec={spec} onChange={edit} dropOn={dropOn} pillProps={pillProps} />
        </div>
        <div className={`${card} px-3 py-1`}>
          {(['columns', 'rows'] as const).map((shelf) => (
            <ListShelfRow key={shelf} shelf={shelf} spec={spec} dropOn={dropOn} pillProps={pillProps} />
          ))}
        </div>
        {editor?.kind === 'filter' && (
          <FilterEditor
            key={`${editor.index}|${editor.filter.field}`}
            source={spec}
            initial={editor.filter}
            onApply={(f) => edit(setFilter(spec, editor.index, f))}
            onCancel={() => setEditor(undefined)}
            onRemove={editor.index < spec.filters.length ? () => edit(removeFilter(spec, editor.index)) : undefined}
          />
        )}
        {editor?.kind === 'calc' && (
          <CalcDialog
            key={editor.index ?? 'new'}
            spec={spec}
            index={editor.index}
            onApply={(calc) => {
              saveCalc({ source: spec.source, ...calc })
              edit(setCalc(spec, editor.index, calc))
            }}
            onCancel={() => setEditor(undefined)}
          />
        )}
        {editor?.kind === 'sort' && pillAt(spec, editor.at) && (
          <SortEditor
            source={spec}
            pill={pillAt(spec, editor.at)!}
            onApply={(p) => edit(replacePill(spec, editor.at, p))}
            onCancel={() => setEditor(undefined)}
          />
        )}
        {pillsOf(spec).length === 0 ? (
          <p className={`${card} p-6 text-center text-slate-500`}>Drag fields from the Data pane to Columns and Rows, or open a field’s menu to add it.</p>
        ) : (
          <Viz spec={spec} title="Your view" />
        )}
      </div>
    </div>
  )
}

const TYPE_ICON: Record<Field['type'], string> = { string: 'Abc', number: '#', date: 'Date', datetime: 'Date', boolean: 'T|F' }

function DataPane({
  spec,
  onChange,
  lockSource,
  onAddFilter,
  onEditCalc,
}: {
  spec: VizSpec
  onChange: (s: VizSpec) => void
  lockSource: boolean
  onAddFilter: (field: string) => void
  /** Opens the calculation editor: a calc's index, or undefined for a new one. */
  onEditCalc: (index?: number) => void
}) {
  const saved = useProgress().calcs.filter((c) => c.source === spec.source && !spec.calcs.some((x) => x.name === c.name))
  // Dropping a pill back on the Data pane removes it, as in Tableau.
  const drop = useDropTarget((d) => d.kind === 'pill' && onChange(removePill(spec, d.at)), (k) => k === 'pill')
  const fields = fieldsOf(spec)
  const group = (role: Field['role'], title: string) => (
    <div>
      <h3 className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <ul className="mt-1 sm:grid sm:grid-cols-2 lg:block">
        {fields
          .filter((f) => f.role === role)
          .map((f) => (
            <li key={f.name}>
              <FieldButton field={f} spec={spec} onChange={onChange} onAddFilter={onAddFilter} onEditCalc={onEditCalc} />
            </li>
          ))}
      </ul>
    </div>
  )
  return (
    <aside aria-label="Data pane" {...drop.props} className={`${card} space-y-3 self-start p-2 ${drop.over ? 'ring-2 ring-accent' : ''}`}>
      <label className="flex flex-col gap-1 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Data source
        <select
          value={spec.source}
          disabled={lockSource}
          onChange={(e) => onChange(emptySpec(e.target.value as SourceId))}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm font-normal tracking-normal text-slate-800 normal-case"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_INFO[s].label}
            </option>
          ))}
        </select>
      </label>
      {group('dimension', 'Dimensions')}
      {group('measure', 'Measures')}
      <MenuButton menuLabel="Calculated fields" label="Calculated field…" className="w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-sm text-slate-600 hover:bg-slate-100">
        {(close) => (
          <>
            <MenuItem
              onSelect={() => {
                close()
                onEditCalc()
              }}
            >
              Create calculated field…
            </MenuItem>
            {saved.length > 0 && <MenuHeading>Saved calculations</MenuHeading>}
            {saved.map((c) => (
              <MenuItem
                key={c.name}
                onSelect={() => {
                  onChange(setCalc(spec, undefined, { name: c.name, formula: c.formula }))
                  close()
                }}
              >
                Add {c.name}
              </MenuItem>
            ))}
          </>
        )}
      </MenuButton>
    </aside>
  )
}

function FieldButton({
  field,
  spec,
  onChange,
  onAddFilter,
  onEditCalc,
}: {
  field: Field
  spec: VizSpec
  onChange: (s: VizSpec) => void
  onAddFilter: (field: string) => void
  onEditCalc: (index?: number) => void
}) {
  const calcIndex = spec.calcs.findIndex((c) => c.name === field.name)
  const broken = field.calc?.error
  const targets: ShelfId[] = ['columns', 'rows', ...CHANNELS, 'detail', 'tooltip']
  return (
    <MenuButton
      menuLabel={`Add ${field.name}`}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'field', field: field.name })}
      title={broken ? broken.message : field.calc?.formula}
      className={`flex w-full cursor-grab items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100 ${field.role === 'dimension' ? 'text-discrete' : 'text-continuous'}`}
      label={
        <>
          <span aria-hidden className="w-8 shrink-0 font-mono text-[10px] text-slate-500">
            {field.calc ? `=${TYPE_ICON[field.type]}` : field.geo ? '⊕' : TYPE_ICON[field.type]}
          </span>
          <span className={broken ? 'text-red-700 line-through' : 'text-slate-800'}>{field.name}</span>
          {field.calc && <span className="sr-only">{broken ? ' (calculation with an error)' : ' (calculated field)'}</span>}
        </>
      }
    >
      {(close) => (
        <>
          {targets.map((shelf) => (
            <MenuItem
              key={shelf}
              onSelect={() => {
                onChange(placePill(spec, pillFor(field.name), shelf))
                close()
              }}
            >
              Add to {SHELF_LABEL[shelf]}
            </MenuItem>
          ))}
          {!field.generated && !broken && (
            <MenuItem
              onSelect={() => {
                close()
                onAddFilter(field.name)
              }}
            >
              Add to Filters…
            </MenuItem>
          )}
          {calcIndex >= 0 && (
            <>
              <MenuHeading>Calculation</MenuHeading>
              <MenuItem
                onSelect={() => {
                  close()
                  onEditCalc(calcIndex)
                }}
              >
                Edit calculation…
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  onChange(removeCalc(spec, field.name))
                  close()
                }}
              >
                {usesField(spec, field.name) ? 'Remove from sheet, with its pills' : 'Remove from sheet'}
              </MenuItem>
            </>
          )}
        </>
      )}
    </MenuButton>
  )
}

function filterLabel(f: Filter): string {
  if (f.kind === 'datePart') return `${f.level.toUpperCase()}(${f.field})`
  if (f.kind === 'range' && f.agg) return `${AGG_LABEL[f.agg]}(${f.field})`
  return f.field
}

function FiltersCard({ spec, onDropField, onEdit }: { spec: VizSpec; onDropField: (field: string) => void; onEdit: (index: number) => void }) {
  const drop = useDropTarget((d) => d.kind === 'field' && onDropField(d.field), (k) => k === 'field')
  return (
    <div role="group" aria-label="Filters shelf" {...drop.props} className={`${card} min-h-20 p-2 ${drop.over ? 'ring-2 ring-accent' : ''}`}>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Filters</h3>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {spec.filters.map((f, i) => (
          <li key={i}>
            <button type="button" onClick={() => onEdit(i)} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs hover:bg-slate-100">
              {filterLabel(f)}
              <span className="sr-only"> (edit filter)</span>
            </button>
          </li>
        ))}
      </ul>
      {spec.filters.length === 0 && <p className="mt-1 text-xs text-slate-400">Drop a field here to filter.</p>}
    </div>
  )
}

type PillProps = Omit<Parameters<typeof ShelfPill>[0], 'at' | 'onDropBefore'>

function MarksCard({
  spec,
  onChange,
  dropOn,
  pillProps,
}: {
  spec: VizSpec
  onChange: (s: VizSpec) => void
  dropOn: (shelf: ShelfId, index?: number) => (d: Dragged) => void
  pillProps: PillProps
}) {
  let auto: string | undefined
  try {
    const inner = (shelf: 'columns' | 'rows') => {
      const p = spec[shelf].at(-1)
      return p ? resolvePill(spec, p) : undefined
    }
    auto = MARK_NAME[automaticMark(inner('columns'), inner('rows'))]
  } catch {
    auto = undefined
  }
  return (
    <div className={`${card} space-y-2 p-2`}>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Marks</h3>
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Mark type</span>
        <select
          value={spec.marks.type}
          onChange={(e) => onChange(setMarkType(spec, e.target.value as MarkType))}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          {MARK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'automatic' && auto ? `Automatic (${auto})` : MARK_NAME[t]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-1">
        {CHANNELS.map((ch) => (
          <ChannelSlot key={ch} shelf={ch} onDrop={dropOn(ch)}>
            {spec.marks[ch] && <ShelfPill {...pillProps} at={{ shelf: ch, index: 0 }} />}
          </ChannelSlot>
        ))}
        {(['detail', 'tooltip'] as const).map((shelf) => (
          <ChannelSlot key={shelf} shelf={shelf} onDrop={dropOn(shelf)}>
            {spec.marks[shelf].map((_, i) => (
              <ShelfPill key={i} {...pillProps} at={{ shelf, index: i }} onDropBefore={dropOn(shelf, i)} />
            ))}
          </ChannelSlot>
        ))}
      </div>
    </div>
  )
}

function ChannelSlot({ shelf, onDrop, children }: { shelf: ShelfId; onDrop: (d: Dragged) => void; children: ReactNode }) {
  const drop = useDropTarget(onDrop)
  return (
    <div
      role="group"
      aria-label={`${SHELF_LABEL[shelf]} shelf`}
      {...drop.props}
      className={`flex min-h-12 flex-col items-start gap-1 rounded border border-dashed border-slate-300 p-1 ${isChannel(shelf) ? '' : 'col-span-3 sm:col-span-1'} ${drop.over ? 'ring-2 ring-accent' : ''}`}
    >
      <span className="text-xs text-slate-500">{SHELF_LABEL[shelf]}</span>
      {children}
    </div>
  )
}

function ListShelfRow({
  shelf,
  spec,
  dropOn,
  pillProps,
}: {
  shelf: Extract<ListShelf, 'columns' | 'rows'>
  spec: VizSpec
  dropOn: (shelf: ShelfId, index?: number) => (d: Dragged) => void
  pillProps: PillProps
}) {
  const drop = useDropTarget(dropOn(shelf))
  return (
    <div
      role="group"
      aria-label={`${SHELF_LABEL[shelf]} shelf`}
      {...drop.props}
      className={`flex min-h-10 flex-wrap items-center gap-1.5 border-b border-slate-200 py-1.5 last:border-b-0 ${drop.over ? 'bg-accent/10' : ''}`}
    >
      <span className="w-20 shrink-0 text-xs font-semibold tracking-wide text-slate-500 uppercase">{SHELF_LABEL[shelf]}</span>
      {spec[shelf].map((_, i) => (
        <ShelfPill key={i} {...pillProps} at={{ shelf, index: i }} onDropBefore={dropOn(shelf, i)} />
      ))}
    </div>
  )
}

/** Analysis > Create Calculated Field, inside the sandbox: the playground's editor on this sheet's fields. */
function CalcDialog({ spec, index, onApply, onCancel }: { spec: VizSpec; index?: number; onApply: (calc: Calc) => void; onCancel: () => void }) {
  const existing = index === undefined ? undefined : spec.calcs[index]
  const [name, setName] = useState(existing?.name ?? nextCalcName(spec))
  const [formula, setFormula] = useState(existing?.formula ?? '')
  // Earlier calcs can be used; the one being edited and later ones can't.
  const sheet = { source: spec.source, calcs: spec.calcs.slice(0, index ?? spec.calcs.length) }
  const valid = name.trim() !== '' && formula.trim() !== '' && 'field' in calcStatus(sheet, name, formula)
  return (
    <section aria-label={existing ? `Edit ${existing.name}` : 'Create calculated field'} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">{existing ? `Edit [${existing.name}]` : 'Create calculated field'}</h3>
      <CalcEditor sheet={sheet} name={name} onName={setName} formula={formula} onFormula={setFormula} />
      <p className="text-xs text-slate-500">The calculation is also saved for your other {SOURCE_INFO[spec.source].label} sheets and the calc playground.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!valid} onClick={() => onApply({ name: name.trim(), formula })} className="rounded bg-brand px-3 py-1 text-chalk disabled:opacity-40">
          {existing ? 'Apply' : 'Add to Data pane'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
      </div>
    </section>
  )
}

/** The first free default name: Calculation1, Calculation2… */
function nextCalcName(spec: VizSpec): string {
  for (let i = 1; ; i++) if (!spec.calcs.some((c) => c.name === `Calculation${i}`)) return `Calculation${i}`
}
