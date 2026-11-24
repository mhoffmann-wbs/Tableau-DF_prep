// The sandbox's Data pane: the data source, fields by role (hierarchies as
// trees), and each field's menu: add it to a shelf or Filters, the field
// actions of lessons 1.3 and 4.2, Create (group, set, bins, hierarchy), and
// calcs. Dialogs open in the Sandbox through `onOpen`.
import {
  CHANNELS,
  type DerivedKind,
  SHELF_LABEL,
  type ShelfId,
  addToHierarchy,
  emptySpec,
  fieldEdit,
  hierarchyOf,
  pillFor,
  placePill,
  removeCalc,
  removeDerived,
  removeFromHierarchy,
  removeHierarchy,
  removePill,
  setCalc,
  usesField,
} from '../engine/edit'
import { type Field, fieldsOf, isEditable, SOURCE_INFO, TYPE_CHANGES } from '../engine/model'
import { type Aggregation, type FieldEdit, type GeoRole, type Group, type Hierarchy, type SetDef, SOURCES, type SourceId, type VizSpec } from '../engine/spec'
import { useProgress } from '../progress/store'
import { startDrag, useDropTarget } from './dnd'
import { MenuButton, MenuHeading, MenuItem } from './Menu'
import { AGG_NAME } from './ShelfPill'

/** Data pane dialogs for a field, named by its data source name. */
export type FieldDialog = 'rename' | 'aliases' | 'comment' | 'format' | 'sort'

/** The dialogs the Data pane opens. */
export type PaneDialog =
  | { kind: 'calc'; index?: number }
  | { kind: 'field'; dialog: FieldDialog; original: string }
  /** A new group, set or bins on `field` (from `preset`, made from marks), or (with `index`) an existing one to edit. */
  | { kind: 'derived'; type: DerivedKind; field: string; index?: number; preset?: Group | SetDef }
  | { kind: 'hierarchy'; fields: string[] }

interface PaneActions {
  spec: VizSpec
  onChange: (s: VizSpec) => void
  onAddFilter: (field: string) => void
  onOpen: (d: PaneDialog) => void
  /** A change to a data source field, by its data source name. */
  onFieldChange: (original: string, patch: Partial<Omit<FieldEdit, 'field'>>) => void
}

const card = 'rounded-lg border border-slate-200 bg-white'
const TYPE_ICON: Record<Field['type'], string> = { string: 'Abc', number: '#', date: 'Date', datetime: 'Date', boolean: 'T|F' }
const DERIVED_ICON = { group: 'Grp', set: 'Set', bin: 'Bin' } as const
const DERIVED_KIND = { group: 'groups', set: 'sets', bin: 'bins' } as const
const DERIVED_NAME = { group: 'Group', set: 'Set', bin: 'Bins' } as const

export function DataPane({ lockSource, ...actions }: PaneActions & { lockSource: boolean }) {
  const { spec, onChange, onOpen } = actions
  const saved = useProgress().calcs.filter((c) => c.source === spec.source && !spec.calcs.some((x) => x.name === c.name))
  // Dropping a pill back on the Data pane removes it, as in Tableau.
  const drop = useDropTarget((d) => d.kind === 'pill' && onChange(removePill(spec, d.at)), (k) => k === 'pill')
  const fields = fieldsOf(spec)
  const byName = new Map(fields.map((f) => [f.name, f]))

  const section = (role: Field['role'], title: string) => {
    const shown = new Set<string>()
    const items = fields
      .filter((f) => f.role === role)
      .flatMap((f) => {
        if (shown.has(f.name)) return []
        const h = role === 'dimension' ? hierarchyOf(spec, f.name) : undefined
        if (!h) return [<FieldItem key={f.name} field={f} {...actions} />]
        // A hierarchy shows where its first field would be, with its fields inside.
        const members = h.fields.map((n) => byName.get(n)).filter((m): m is Field => m?.role === 'dimension')
        for (const m of members) shown.add(m.name)
        return [<HierarchyItem key={`h:${h.name}`} hierarchy={h} fields={members} {...actions} />]
      })
    return (
      <div>
        <h3 className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
        <ul className="mt-1 sm:grid sm:grid-cols-2 lg:block">{items}</ul>
      </div>
    )
  }

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
      {section('dimension', 'Dimensions')}
      {section('measure', 'Measures')}
      <MenuButton menuLabel="Calculated fields" label="Calculated field…" className="w-full rounded border border-dashed border-slate-300 px-2 py-1 text-left text-sm text-slate-600 hover:bg-slate-100">
        {(close) => (
          <>
            <MenuItem
              onSelect={() => {
                close()
                onOpen({ kind: 'calc' })
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

function HierarchyItem({ hierarchy, fields, ...actions }: { hierarchy: Hierarchy; fields: Field[] } & PaneActions) {
  const { spec, onChange } = actions
  return (
    <li className="sm:col-span-2">
      <MenuButton
        menuLabel={`Hierarchy ${hierarchy.name}`}
        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm text-slate-800 hover:bg-slate-100"
        label={
          <>
            <span aria-hidden className="w-8 shrink-0 font-mono text-[10px] text-slate-500">
              ⊿
            </span>
            {hierarchy.name}
            <span className="sr-only"> (hierarchy)</span>
          </>
        }
      >
        {(close) => (
          <MenuItem
            onSelect={() => {
              onChange(removeHierarchy(spec, hierarchy.name))
              close()
            }}
          >
            Remove Hierarchy
          </MenuItem>
        )}
      </MenuButton>
      <ul aria-label={`${hierarchy.name} levels`} className="ml-3 border-l border-slate-200 pl-1">
        {fields.map((f) => (
          <FieldItem key={f.name} field={f} {...actions} />
        ))}
      </ul>
    </li>
  )
}

/** One field: drag it to a shelf (or onto another dimension to make a hierarchy), or open its menu. */
function FieldItem({ field, ...actions }: { field: Field } & PaneActions) {
  const { spec, onChange, onAddFilter, onOpen } = actions
  const calcIndex = spec.calcs.findIndex((c) => c.name === field.name)
  const problem = field.calc?.error?.message ?? field.broken
  const targets: ShelfId[] = ['columns', 'rows', ...CHANNELS, 'detail', 'tooltip']
  // A dimension dropped on a dimension: into this one's hierarchy, or a new hierarchy of the two.
  const drop = useDropTarget(
    (d) => {
      if (d.kind !== 'field' || d.field === field.name || field.role !== 'dimension') return
      if (fieldsOf(spec).find((f) => f.name === d.field)?.role !== 'dimension') return
      const h = hierarchyOf(spec, field.name)
      if (h) onChange(addToHierarchy(spec, h.name, d.field, h.fields[h.fields.indexOf(field.name) + 1]))
      else onOpen({ kind: 'hierarchy', fields: [field.name, d.field] })
    },
    (k) => k === 'field',
  )
  const icon = field.calc ? `=${TYPE_ICON[field.type]}` : field.derived ? DERIVED_ICON[field.derived.kind] : field.geo ? '⊕' : TYPE_ICON[field.type]
  const kindNote = field.calc ? 'calculated field' : field.derived ? field.derived.kind : undefined
  return (
    <li {...(field.role === 'dimension' && drop.props)} className={drop.over ? 'rounded ring-2 ring-accent' : undefined}>
      <MenuButton
        menuLabel={`Add ${field.name}`}
        draggable
        onDragStart={(e) => startDrag(e, { kind: 'field', field: field.name })}
        title={problem ?? field.calc?.formula ?? field.comment}
        className={`flex w-full cursor-grab items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100 ${field.role === 'dimension' ? 'text-discrete' : 'text-continuous'}`}
        label={
          <>
            <span aria-hidden className="w-8 shrink-0 font-mono text-[10px] text-slate-500">
              {icon}
            </span>
            <span className={problem ? 'text-red-700 line-through' : 'text-slate-800'}>{field.name}</span>
            {kindNote && <span className="sr-only">{` (${kindNote}${problem ? ' with an error' : ''})`}</span>}
          </>
        }
      >
        {(close) => {
          const act = (fn: () => void) => () => {
            close()
            fn()
          }
          return (
            <>
              {targets.map((shelf) => (
                <MenuItem key={shelf} onSelect={act(() => onChange(placePill(spec, pillFor(field.name), shelf)))}>
                  Add to {SHELF_LABEL[shelf]}
                </MenuItem>
              ))}
              {!field.generated && !problem && <MenuItem onSelect={act(() => onAddFilter(field.name))}>Add to Filters…</MenuItem>}
              {isEditable(field, spec.source) && <FieldMenu field={field} act={act} {...actions} />}
              {field.role === 'dimension' && !field.generated && <HierarchyMenu field={field} act={act} {...actions} />}
              {field.derived && (
                <>
                  <MenuHeading>{DERIVED_NAME[field.derived.kind]}</MenuHeading>
                  <MenuItem
                    onSelect={act(() => {
                      const type = DERIVED_KIND[field.derived!.kind]
                      onOpen({ kind: 'derived', type, field: field.derived!.def.field, index: (spec[type] as { name: string }[]).findIndex((d) => d.name === field.name) })
                    })}
                  >
                    Edit {DERIVED_NAME[field.derived.kind]}…
                  </MenuItem>
                  <MenuItem onSelect={act(() => onChange(removeDerived(spec, field.name)))}>{usesField(spec, field.name) ? 'Remove from sheet, with its pills' : 'Remove from sheet'}</MenuItem>
                </>
              )}
              {calcIndex >= 0 && (
                <>
                  <MenuHeading>Calculation</MenuHeading>
                  <MenuItem onSelect={act(() => onOpen({ kind: 'calc', index: calcIndex }))}>Edit calculation…</MenuItem>
                  <MenuItem onSelect={act(() => onChange(removeCalc(spec, field.name)))}>{usesField(spec, field.name) ? 'Remove from sheet, with its pills' : 'Remove from sheet'}</MenuItem>
                </>
              )}
            </>
          )
        }}
      </MenuButton>
    </li>
  )
}

type Act = (fn: () => void) => () => void

/** Create Hierarchy, Add to Hierarchy and Remove from Hierarchy, for any dimension. */
function HierarchyMenu({ field, act, spec, onChange, onOpen }: { field: Field; act: Act } & PaneActions) {
  const h = hierarchyOf(spec, field.name)
  const others = spec.hierarchies.filter((x) => x !== h)
  return (
    <>
      <MenuHeading>Hierarchy</MenuHeading>
      {!h && <MenuItem onSelect={act(() => onOpen({ kind: 'hierarchy', fields: [field.name] }))}>Create Hierarchy…</MenuItem>}
      {others.map((x) => (
        <MenuItem key={x.name} onSelect={act(() => onChange(addToHierarchy(spec, x.name, field.name)))}>
          Add to Hierarchy {x.name}
        </MenuItem>
      ))}
      {h && <MenuItem onSelect={act(() => onChange(removeFromHierarchy(spec, field.name)))}>Remove from Hierarchy</MenuItem>}
    </>
  )
}

const TYPE_NAME: Record<Field['type'], string> = { string: 'String', number: 'Number', date: 'Date', datetime: 'Date & Time', boolean: 'Boolean' }
const GEO_NAME: Record<GeoRole, string> = {
  country: 'Country/Region',
  state: 'State/Province',
  city: 'City',
  postal: 'ZIP Code/Postcode',
  latitude: 'Latitude',
  longitude: 'Longitude',
}
const DEFAULT_AGGS: Aggregation[] = ['sum', 'avg', 'median', 'count', 'countd', 'min', 'max']

/** The field actions of lessons 1.3, 2.2, 2.3 and 4.2 for a data source field. */
function FieldMenu({ field, act, spec, onOpen, onFieldChange }: { field: Field; act: Act } & PaneActions) {
  const original = field.original?.name ?? field.name
  const edit = fieldEdit(spec, original)
  const change = (patch: Partial<Omit<FieldEdit, 'field'>>) => act(() => onFieldChange(original, patch))
  const dialog = (d: FieldDialog) => act(() => onOpen({ kind: 'field', original, dialog: d }))
  const create = (type: DerivedKind) => act(() => onOpen({ kind: 'derived', type, field: field.name }))
  const isDate = field.type === 'date' || field.type === 'datetime'
  const types = [field.original?.type ?? field.type, ...TYPE_CHANGES[field.original?.type ?? field.type]]
  const roles: GeoRole[] = field.type === 'string' && field.role === 'dimension' ? ['country', 'state', 'city', 'postal'] : field.type === 'number' ? ['latitude', 'longitude'] : []
  // Convert to Discrete/Continuous: numbers and dates only; the default is continuous for measures.
  const natural = field.role === 'measure' ? 'continuous' : 'discrete'
  const current = field.as ?? natural
  const toggle = current === 'discrete' ? 'continuous' : 'discrete'
  return (
    <>
      <MenuHeading>Field</MenuHeading>
      <MenuItem onSelect={dialog('rename')}>Rename…</MenuItem>
      {field.role === 'dimension' && !isDate && field.as !== 'continuous' && <MenuItem onSelect={dialog('aliases')}>Aliases…</MenuItem>}
      {field.role === 'measure' && <MenuItem onSelect={change({ role: 'dimension', as: undefined })}>Convert to Dimension</MenuItem>}
      {edit?.role === 'dimension' && <MenuItem onSelect={change({ role: undefined, as: undefined, aliases: undefined, sort: undefined })}>Convert to Measure</MenuItem>}
      {(field.type === 'number' || isDate) && <MenuItem onSelect={change({ as: toggle === natural ? undefined : toggle, aliases: undefined })}>Convert to {toggle === 'continuous' ? 'Continuous' : 'Discrete'}</MenuItem>}
      <MenuHeading>Create</MenuHeading>
      {field.role === 'dimension' && !isDate && <MenuItem onSelect={create('groups')}>Group…</MenuItem>}
      {field.role === 'dimension' && !isDate && <MenuItem onSelect={create('sets')}>Set…</MenuItem>}
      {field.type === 'number' && <MenuItem onSelect={create('bins')}>Bins…</MenuItem>}
      {field.role === 'dimension' && types.length > 1 && (
        <>
          <MenuHeading>Change Data Type</MenuHeading>
          {types.map((t) => (
            <MenuItem key={t} checked={field.type === t} onSelect={change({ type: t === (field.original?.type ?? field.type) ? undefined : t })}>
              {TYPE_NAME[t]}
            </MenuItem>
          ))}
        </>
      )}
      {roles.length > 0 && (
        <>
          <MenuHeading>Geographic Role</MenuHeading>
          {roles.map((g) => (
            <MenuItem key={g} checked={field.geo === g} onSelect={change({ geo: g })}>
              {GEO_NAME[g]}
            </MenuItem>
          ))}
        </>
      )}
      <MenuHeading>Default Properties</MenuHeading>
      <MenuItem onSelect={dialog('comment')}>Comment…</MenuItem>
      {field.type === 'number' && <MenuItem onSelect={dialog('format')}>Number Format…</MenuItem>}
      {field.role === 'dimension' && !isDate && <MenuItem onSelect={dialog('sort')}>Sort…</MenuItem>}
      {field.role === 'measure' &&
        DEFAULT_AGGS.map((a) => (
          <MenuItem key={a} checked={field.agg === a} onSelect={change({ agg: a })}>
            Aggregation: {AGG_NAME[a]}
          </MenuItem>
        ))}
      {edit && (
        <>
          <MenuHeading>Sandbox</MenuHeading>
          <MenuItem onSelect={change(Object.fromEntries(Object.keys(edit).filter((k) => k !== 'field').map((k) => [k, undefined])))}>Undo all changes to this field</MenuItem>
        </>
      )}
    </>
  )
}
