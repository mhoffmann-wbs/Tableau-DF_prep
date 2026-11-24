import { type ReactNode, useState } from 'react'
import {
  CHANNELS,
  type ListShelf,
  type PillAt,
  SHELF_LABEL,
  type ShelfId,
  createHierarchy,
  defaultFilter,
  editField,
  isChannel,
  movePill,
  pillAt,
  pillFor,
  placePill,
  removeFilter,
  replacePill,
  setCalc,
  setDerived,
  setFilter,
  setMarkType,
} from '../engine/edit'
import { type Field, fieldOf, fieldsOf, isEditable, SOURCE_INFO } from '../engine/model'
import type { MarkMembers } from '../engine/runtime'
import { AGG_LABEL, EngineError, resolvePill } from '../engine/pills'
import { automaticMark } from '../engine/render'
import { type Bin, type Calc, type FieldEdit, type Group, MARK_TYPES, type Filter, type MarkType, type SetDef, type VizSpec, pillsOf } from '../engine/spec'
import { Viz } from '../engine/Viz'
import { type Dragged, useDropTarget } from './dnd'
import { FilterEditor } from './FilterEditor'
import { saveCalc } from '../progress/store'
import { CalcEditor, calcStatus } from './CalcEditor'
import { DataPane, type PaneDialog } from './DataPane'
import { BinEditor, GroupEditor, HierarchyEditor, SetEditor } from './DerivedEditors'
import { AliasEditor, CommentEditor, NumberFormatEditor, RenameEditor } from './FieldEditors'
import { ShelfPill } from './ShelfPill'
import { SortEditor } from './SortEditor'

/** The open dialog; `error` is why its last change was refused (a taken name). */
type Editor = ({ kind: 'filter'; index: number; filter: Filter } | { kind: 'sort'; at: PillAt } | PaneDialog) & { error?: string }

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
  /** Applies a change that may be refused (a taken name): then its dialog stays open with the reason. */
  const tryEdit = (change: () => VizSpec) => {
    try {
      edit(change())
    } catch (e) {
      if (!(e instanceof EngineError)) throw e
      setEditor((cur) => cur && { ...cur, error: e.message })
    }
  }
  const changeField = (original: string, patch: Partial<Omit<FieldEdit, 'field'>>) => tryEdit(() => editField(spec, original, patch))
  // Marks selected in the view, for a group or set made from marks; a new chart starts a new selection.
  const viewKey = JSON.stringify(spec)
  const [selection, setSelection] = useState<{ key: string; marks: MarkMembers[] }>()
  const selected = selection?.key === viewKey ? selection.marks : []
  const selectMark = (members: MarkMembers, additive: boolean) => {
    if (members.length === 0) return setSelection(undefined)
    const same = (m: MarkMembers) => JSON.stringify(m) === JSON.stringify(members)
    const marks = additive ? (selected.some(same) ? selected.filter((m) => !same(m)) : [...selected, members]) : [members]
    setSelection({ key: viewKey, marks })
  }
  const fieldEditor = editor?.kind === 'field' ? fieldsOf(spec).find((f) => (f.original?.name ?? f.name) === editor.original) : undefined

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <DataPane spec={spec} onChange={edit} lockSource={lockSource} onAddFilter={addFilter} onOpen={setEditor} onFieldChange={changeField} />
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
            initial={pillAt(spec, editor.at)!.sort}
            onApply={(sort) => {
              const { sort: _old, ...pill } = pillAt(spec, editor.at)!
              edit(replacePill(spec, editor.at, sort ? { ...pill, sort } : pill))
            }}
            onCancel={() => setEditor(undefined)}
          />
        )}
        {editor?.kind === 'field' && fieldEditor && (
          <FieldDialogView key={`${editor.original}|${editor.dialog}`} spec={spec} field={fieldEditor} editor={editor} onApply={(patch) => changeField(editor.original, patch)} onCancel={() => setEditor(undefined)} />
        )}
        {editor?.kind === 'derived' && (
          <DerivedDialog key={`${editor.type}|${editor.field}|${editor.index ?? 'new'}`} spec={spec} editor={editor} onApply={tryEdit} onCancel={() => setEditor(undefined)} />
        )}
        {editor?.kind === 'hierarchy' && (
          <HierarchyEditor
            key={editor.fields.join('|')}
            fields={editor.fields}
            error={editor.error}
            onApply={(name) => tryEdit(() => createHierarchy(spec, name, editor.fields))}
            onCancel={() => setEditor(undefined)}
          />
        )}
        {pillsOf(spec).length === 0 ? (
          <p className={`${card} p-6 text-center text-slate-500`}>Drag fields from the Data pane to Columns and Rows, or open a field’s menu to add it.</p>
        ) : (
          <>
            <Viz spec={spec} title="Your view" onMark={selectMark} />
            {selected.length > 0 && <SelectionBar spec={spec} marks={selected} onClear={() => setSelection(undefined)} onOpen={setEditor} />}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The marks selected in the view, with the two commands Tableau offers on
 * them here: Group (the paperclip) and Create Set, on one of their dimensions.
 */
function SelectionBar({ spec, marks, onClear, onOpen }: { spec: VizSpec; marks: MarkMembers[]; onClear: () => void; onOpen: (d: PaneDialog) => void }) {
  // Groups and sets are made from data source dimensions that aren't dates.
  const usable = [...new Set(marks.flatMap((m) => m.map((x) => x.field)))].filter((name) => {
    const f = fieldOf(spec, name)
    return f && isEditable(f, spec.source) && f.role === 'dimension' && f.type !== 'date' && f.type !== 'datetime'
  })
  const [chosen, setChosen] = useState<string>()
  const field = chosen && usable.includes(chosen) ? chosen : usable[0]
  const members = field ? [...new Set(marks.flatMap((m) => m.filter((x) => x.field === field).map((x) => x.member)))] : []
  return (
    <div role="region" aria-label="Selected marks" className={`${card} flex flex-wrap items-center gap-2 p-2 text-sm`}>
      <span>
        {marks.length} {marks.length === 1 ? 'mark' : 'marks'} selected{field && `: ${members.join(', ')}`}
      </span>
      {usable.length > 1 && (
        <label className="flex items-center gap-1">
          by
          <select className="rounded border border-slate-300 bg-white px-1 py-0.5" value={field} onChange={(e) => setChosen(e.target.value)}>
            {usable.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      )}
      {field ? (
        <>
          <button
            type="button"
            onClick={() => onOpen({ kind: 'derived', type: 'groups', field, preset: { name: `${field} (group)`, field, groups: [{ name: members.join(', '), members }] } })}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          >
            📎 Group
          </button>
          <button
            type="button"
            onClick={() => onOpen({ kind: 'derived', type: 'sets', field, preset: { name: `${field} Set`, field, fixed: true, rule: { kind: 'members', members } } })}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          >
            Create Set…
          </button>
        </>
      ) : (
        <span className="text-slate-500">These marks have no dimension to group (dates and calculated fields can’t be grouped here).</span>
      )}
      <button type="button" onClick={onClear} className="ml-auto text-xs text-brand-dark underline">
        Clear selection
      </button>
      <p className="w-full text-xs text-slate-500">Shift-, Ctrl- or ⌘-click marks to add them; click the background to clear.</p>
    </div>
  )
}

/** The open Data pane dialog for a field. */
function FieldDialogView({
  spec,
  field,
  editor,
  onApply,
  onCancel,
}: {
  spec: VizSpec
  field: Field
  editor: Extract<Editor, { kind: 'field' }>
  onApply: (patch: Partial<Omit<FieldEdit, 'field'>>) => void
  onCancel: () => void
}) {
  const props = { field, onApply, onCancel, error: editor.error }
  switch (editor.dialog) {
    case 'rename':
      return <RenameEditor {...props} />
    case 'aliases':
      return <AliasEditor {...props} source={spec} />
    case 'comment':
      return <CommentEditor {...props} />
    case 'format':
      return <NumberFormatEditor {...props} />
    case 'sort':
      return <SortEditor source={spec} pill={{ field: field.name }} scope="default" initial={field.sort} onApply={(sort) => onApply({ sort })} onCancel={onCancel} />
  }
}

/** Create or edit a group, set or bins. */
function DerivedDialog({ spec, editor, onApply, onCancel }: { spec: VizSpec; editor: Extract<Editor, { kind: 'derived' }>; onApply: (change: () => VizSpec) => void; onCancel: () => void }) {
  const { type, field, index, error } = editor
  const common = { source: spec, field, error, onCancel, editing: index !== undefined }
  const apply = <T extends Group | SetDef | Bin>(def: T) => onApply(() => setDerived(spec, type, index, def as never))
  const initial = index === undefined ? editor.preset : spec[type][index]
  if (type === 'groups') return <GroupEditor {...common} initial={initial as Group | undefined} onApply={apply} />
  if (type === 'sets') return <SetEditor {...common} initial={initial as SetDef | undefined} onApply={apply} />
  return <BinEditor {...common} initial={initial as Bin | undefined} onApply={apply} />
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
  const sheet = { source: spec.source, fields: spec.fields, calcs: spec.calcs.slice(0, index ?? spec.calcs.length) }
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
