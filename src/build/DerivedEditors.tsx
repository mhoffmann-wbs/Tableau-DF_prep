// Create > Group, Set and Bins, and Create Hierarchy (lessons 2.2 and 2.3).
// Each dialog returns the definition; the Sandbox adds it to the spec and
// shows a refusal (a taken name) through `error`.
import { type ReactNode, useState } from 'react'
import { type Field, fieldsOf, sheetOf, type SourceRef } from '../engine/model'
import { AGG_LABEL } from '../engine/pills'
import { AGGREGATIONS, type Aggregation, type Bin, type Group, SET_OPS, type SetDef } from '../engine/spec'
import { useMembers } from './members'

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'
const SHOWN = 200

function Dialog({ title, error, ok, onOk, onCancel, children }: { title: string; error?: string; ok?: boolean; onOk: () => void; onCancel: () => void; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">{title}</h3>
      {children}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ok === false} onClick={onOk} className="rounded bg-brand px-3 py-1 text-chalk disabled:opacity-40">
          OK
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
      </div>
    </section>
  )
}

function NameInput({ value, onChange, label = 'Field name' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

interface DialogProps<T> {
  source: SourceRef
  /** The field the group, set or bins are made from. */
  field: string
  initial?: T
  /** Editing a group, set or bins already on the sheet (rather than a new one, perhaps from marks). */
  editing?: boolean
  onApply: (def: T) => void
  onCancel: () => void
  error?: string
}

/** Member checkboxes with a search, loaded from the data; values are the underlying members. */
function MemberChecklist({ source, field, selected, onChange, hidden }: { source: SourceRef; field: string; selected: string[]; onChange: (s: string[]) => void; hidden?: Set<string> }) {
  const members = useMembers(sheetOf(source), { field })
  const [search, setSearch] = useState('')
  if (!members) return <p className="text-slate-500">Loading the members…</p>
  const list = members.filter((m) => !hidden?.has(m.value as string) && m.label.toLowerCase().includes(search.trim().toLowerCase()))
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  return (
    <div className="space-y-1">
      {members.length > 12 && <input type="search" aria-label="Search members" placeholder="Search" className={`${inputClass} w-full`} value={search} onChange={(e) => setSearch(e.target.value)} />}
      <ul className="max-h-56 overflow-y-auto rounded border border-slate-200 p-2">
        {list.slice(0, SHOWN).map((m) => (
          <li key={String(m.value)}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(m.value as string)} onChange={() => toggle(m.value as string)} />
              {m.label}
            </label>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-slate-500">No members left.</li>}
        {list.length > SHOWN && <li className="text-xs text-slate-500">…and {list.length - SHOWN} more. Search to narrow the list.</li>}
      </ul>
    </div>
  )
}

export function GroupEditor({ source, field, initial, editing, onApply, onCancel, error }: DialogProps<Group>) {
  const [name, setName] = useState(initial?.name ?? `${field} (group)`)
  const [groups, setGroups] = useState(initial?.groups ?? [])
  const [other, setOther] = useState(initial?.other ?? false)
  const [selected, setSelected] = useState<string[]>([])
  const grouped = new Set(groups.flatMap((g) => g.members))
  const setGroup = (i: number, g: Group['groups'][number] | undefined) => setGroups(g ? groups.map((x, j) => (j === i ? g : x)) : groups.filter((_, j) => j !== i))
  return (
    <Dialog title={editing ? `Edit Group [${initial!.name}]` : `Create Group [${field}]`} error={error} onOk={() => onApply({ name: name.trim(), field, groups, ...(other && { other }) })} onCancel={onCancel} ok={name.trim() !== '' && groups.length > 0}>
      <NameInput value={name} onChange={setName} />
      <p className="text-slate-600">Select members, then Group them. A new group is named after its members; rename it if you like.</p>
      <MemberChecklist source={source} field={field} selected={selected} onChange={setSelected} hidden={grouped} />
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => {
          setGroups([...groups, { name: selected.join(', '), members: selected }])
          setSelected([])
        }}
        className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
      >
        Group
      </button>
      {groups.length > 0 && (
        <ul aria-label="Groups" className="space-y-2">
          {groups.map((g, i) => (
            <li key={i} className="rounded border border-slate-200 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label={`Group name ${i + 1}`} className={`${inputClass} flex-1`} value={g.name} onChange={(e) => setGroup(i, { ...g, name: e.target.value })} />
                <button type="button" onClick={() => setGroup(i, undefined)} className="rounded border border-slate-300 px-2 py-0.5 text-xs">
                  Ungroup all
                </button>
              </div>
              <ul className="mt-1 flex flex-wrap gap-1">
                {g.members.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      aria-label={`Ungroup ${m}`}
                      onClick={() => setGroup(i, g.members.length > 1 ? { ...g, members: g.members.filter((x) => x !== m) } : undefined)}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs hover:bg-slate-200"
                    >
                      {m} ×
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={other} onChange={(e) => setOther(e.target.checked)} />
        Include ‘Other’
      </label>
    </Dialog>
  )
}

type SetTab = SetDef['rule']['kind']
const TAB_NAME: Record<SetTab, string> = { members: 'General', condition: 'Condition', top: 'Top' }

/** A measure and its aggregation, for the Condition and Top tabs. */
function ByField({ measures, field, agg, onChange }: { measures: Field[]; field: string; agg: Aggregation; onChange: (f: string, a: Aggregation) => void }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        By field
        <select className={inputClass} value={field} onChange={(e) => onChange(e.target.value, measures.find((m) => m.name === e.target.value)?.agg ?? 'sum')}>
          {measures.map((m) => (
            <option key={m.name}>{m.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Aggregation
        <select className={inputClass} value={agg} onChange={(e) => onChange(field, e.target.value as Aggregation)}>
          {AGGREGATIONS.filter((a) => a !== 'attr').map((a) => (
            <option key={a} value={a}>
              {AGG_LABEL[a]}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

export function SetEditor({ source, field, initial, editing, onApply, onCancel, error }: DialogProps<SetDef>) {
  const measures = fieldsOf(source).filter((f) => f.role === 'measure' && !f.generated && !f.calc && !f.derived)
  const rule = initial?.rule
  const [name, setName] = useState(initial?.name ?? `${field} Set`)
  const [tab, setTab] = useState<SetTab>(rule?.kind ?? 'members')
  const [members, setMembers] = useState(rule?.kind === 'members' ? rule.members : [])
  const [exclude, setExclude] = useState(rule?.kind === 'members' ? (rule.exclude ?? false) : false)
  const [by, setBy] = useState<{ field: string; agg: Aggregation }>(rule && rule.kind !== 'members' ? { field: rule.field, agg: rule.agg } : { field: measures[0]!.name, agg: measures[0]!.agg ?? 'sum' })
  const [op, setOp] = useState<(typeof SET_OPS)[number]>(rule?.kind === 'condition' ? rule.op : '>')
  const [value, setValue] = useState(rule?.kind === 'condition' ? String(rule.value) : '')
  const [from, setFrom] = useState<'top' | 'bottom'>(rule?.kind === 'top' ? rule.from : 'top')
  const [n, setN] = useState(String(rule?.kind === 'top' ? rule.n : 10))

  const build = (): SetDef['rule'] | undefined => {
    if (tab === 'members') return { kind: 'members', members, ...(exclude && { exclude }) }
    if (tab === 'top') return Number.isInteger(Number(n)) && Number(n) >= 1 ? { kind: 'top', from, n: Number(n), ...by } : undefined
    const v = Number(value)
    return value.trim() !== '' && Number.isFinite(v) ? { kind: 'condition', op, value: v, ...by } : undefined
  }
  const built = build()
  return (
    <Dialog
      title={editing ? `Edit Set [${initial!.name}]` : `Create Set [${field}]`}
      error={error}
      ok={name.trim() !== '' && built !== undefined}
      onOk={() => onApply({ name: name.trim(), field, ...(initial?.fixed && { fixed: true }), rule: built! })}
      onCancel={onCancel}
    >
      <NameInput value={name} onChange={setName} />
      {initial?.fixed ? (
        <p className="text-slate-600">A fixed set made from marks: its members don’t change when the data does. Edit them below.</p>
      ) : (
        <div role="tablist" aria-label="Set definition" className="flex gap-1 border-b border-slate-200">
          {(Object.keys(TAB_NAME) as SetTab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-1 ${tab === t ? 'border-brand font-semibold' : 'border-transparent text-slate-600'}`}>
              {TAB_NAME[t]}
            </button>
          ))}
        </div>
      )}
      {tab === 'members' && (
        <div role="tabpanel" className="space-y-2">
          <MemberChecklist source={source} field={field} selected={members} onChange={setMembers} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
            Exclude the selected members
          </label>
        </div>
      )}
      {tab === 'condition' && (
        <div role="tabpanel" className="flex flex-wrap items-end gap-3">
          <ByField measures={measures} field={by.field} agg={by.agg} onChange={(f, a) => setBy({ field: f, agg: a })} />
          <label className="flex flex-col gap-1">
            Operator
            <select className={inputClass} value={op} onChange={(e) => setOp(e.target.value as (typeof SET_OPS)[number])}>
              {SET_OPS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Value
            <input type="number" className={`${inputClass} w-28`} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <p className="w-full text-slate-600">
            In the set: members whose {AGG_LABEL[by.agg]}({by.field}) {op} {value || '…'}, over the whole data source.
          </p>
        </div>
      )}
      {tab === 'top' && (
        <div role="tabpanel" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            Top or bottom
            <select className={inputClass} value={from} onChange={(e) => setFrom(e.target.value as 'top' | 'bottom')}>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            How many
            <input type="number" min={1} step={1} className={`${inputClass} w-20`} value={n} onChange={(e) => setN(e.target.value)} />
          </label>
          <ByField measures={measures} field={by.field} agg={by.agg} onChange={(f, a) => setBy({ field: f, agg: a })} />
        </div>
      )}
    </Dialog>
  )
}

export function BinEditor({ field, initial, editing, onApply, onCancel, error }: DialogProps<Bin>) {
  const [name, setName] = useState(initial?.name ?? `${field} (bin)`)
  const [size, setSize] = useState(String(initial?.size ?? 10))
  const valid = Number(size) > 0
  return (
    <Dialog title={editing ? `Edit Bins [${field}]` : `Create Bins [${field}]`} error={error} ok={name.trim() !== '' && valid} onOk={() => onApply({ name: name.trim(), field, size: Number(size) })} onCancel={onCancel}>
      <NameInput value={name} onChange={setName} label="New field name" />
      <label className="flex flex-col gap-1">
        Size of bins
        <input type="number" min={0} step="any" className={`${inputClass} w-28`} value={size} onChange={(e) => setSize(e.target.value)} />
      </label>
      <p className="text-slate-600">Each bin holds values from its lower limit (inclusive) up to the next one; it is labelled by its lower limit.</p>
    </Dialog>
  )
}

export function HierarchyEditor({ fields, onApply, onCancel, error }: { fields: string[]; onApply: (name: string) => void; onCancel: () => void; error?: string }) {
  const [name, setName] = useState(`${fields[0]} Hierarchy`)
  return (
    <Dialog title="Create Hierarchy" error={error} ok={name.trim() !== ''} onOk={() => onApply(name.trim())} onCancel={onCancel}>
      <NameInput value={name} onChange={setName} label="Name" />
      <p className="text-slate-600">
        Levels, from general to detailed: {fields.join(' › ')}. Drop more dimensions on a level in the Data pane, or use a field’s menu, to add them.
      </p>
    </Dialog>
  )
}
