// The sandbox's dashboard tab (lesson 3.2): the two sheets in a horizontal or
// vertical layout container, Use as Filter on each sheet, and Dashboard >
// Actions for filter actions. The action logic is in engine/dashboard.ts.
import { useState } from 'react'
import {
  type ActionState,
  CLEARING,
  type Clearing,
  type FilterAction,
  filteredSheet,
  newActionName,
  nextActionState,
  RUN_ON,
  type RunOn,
  sheetName,
  toggleUseAsFilter,
  usesAsFilter,
  viewDimensions,
  type Workbook,
} from '../engine/dashboard'
import type { MarkMembers } from '../engine/runtime'
import type { VizSpec } from '../engine/spec'
import { Viz } from '../engine/Viz'

const RUN_LABELS: Record<RunOn, string> = { hover: 'Hover', select: 'Select', menu: 'Menu' }
const CLEARING_LABELS: Record<Clearing, string> = { leave: 'Leave the filter', all: 'Show all values', exclude: 'Exclude all values' }
const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

const isEmpty = (spec: VizSpec) =>
  spec.columns.length + spec.rows.length + spec.marks.detail.length === 0 && !spec.marks.color && !spec.marks.size && !spec.marks.label && !spec.marks.shape

/** A mark's members as one line, e.g. "Genre: Comedy". */
const describe = (mark: MarkMembers) => mark.map((m) => `${m.field}: ${m.member}`).join(', ')

export function Dashboard({ workbook, onChange }: { workbook: Workbook; onChange: (next: Workbook) => void }) {
  const { actions, layout } = workbook.dashboard
  // Action states and selections last while the actions stay the same.
  const actionsKey = JSON.stringify(actions)
  const [run, setRun] = useState<{ key: string; states: ActionState[]; selected: MarkMembers[][] }>({ key: actionsKey, states: [], selected: [] })
  const current = run.key === actionsKey ? run : { key: actionsKey, states: [], selected: [] }
  const [editing, setEditing] = useState(false)

  /** Runs the actions from `source` that react to `on` with the marks now selected (empty = cleared). */
  const fire = (source: number, on: RunOn, marks: MarkMembers[]) => {
    const states = actions.map((a, i) => (a.source === source && a.run === on ? nextActionState(a, marks, current.states[i]) : current.states[i]))
    setRun({ ...current, states })
  }

  const click = (source: number, members: MarkMembers, additive: boolean) => {
    const prev = current.selected[source] ?? []
    const known = prev.some((m) => describe(m) === describe(members))
    const marks = members.length === 0 ? [] : additive ? (known ? prev.filter((m) => describe(m) !== describe(members)) : [...prev, members]) : [members]
    const selected = workbook.sheets.map((_, i) => (i === source ? marks : (current.selected[i] ?? [])))
    // Menu actions wait for their link; clearing the selection still clears them.
    const menu = marks.length === 0 ? actions.map((a, i) => (a.source === source && a.run === 'menu' ? nextActionState(a, [], current.states[i]) : current.states[i])) : current.states
    const states = actions.map((a, i) => (a.source === source && a.run === 'select' ? nextActionState(a, marks, menu[i]) : menu[i]))
    setRun({ key: actionsKey, states, selected })
  }

  const runMenu = (index: number) => {
    const action = actions[index]!
    const states = current.states.slice()
    states[index] = nextActionState(action, current.selected[action.source] ?? [], current.states[index])
    setRun({ ...current, states })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1" role="group" aria-label="Layout container">
          Layout:
          {(['horizontal', 'vertical'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layout === l}
              onClick={() => onChange({ ...workbook, dashboard: { ...workbook.dashboard, layout: l } })}
              className={`rounded border px-2 py-0.5 ${layout === l ? 'border-brand bg-brand text-chalk' : 'border-slate-300'}`}
            >
              {l === 'horizontal' ? 'Horizontal' : 'Vertical'}
            </button>
          ))}
        </span>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} className="rounded border border-slate-300 px-3 py-1">
          Dashboard ▸ Actions…
        </button>
        <span className="text-slate-500">
          {actions.length === 0 ? 'No actions yet.' : `${actions.length} action${actions.length === 1 ? '' : 's'}.`} Click a mark to select it; Shift, Ctrl or ⌘ adds to the selection, and a click on the background clears it.
        </span>
      </div>
      {editing && <ActionsDialog workbook={workbook} onChange={onChange} onClose={() => setEditing(false)} />}
      <div className={`grid gap-3 ${layout === 'horizontal' ? 'lg:grid-cols-2' : ''}`}>
        {workbook.sheets.map((sheet, i) => {
          const view = filteredSheet(workbook, i, current.states)
          const selected = current.selected[i] ?? []
          const hover = actions.some((a) => a.source === i && a.run === 'hover')
          const menus = actions.map((a, index) => ({ a, index })).filter(({ a }) => a.source === i && a.run === 'menu')
          const filtering = actions.some((a, index) => a.target === i && current.states[index] !== undefined)
          return (
            <section key={i} aria-label={sheetName(i)} className="min-w-0 space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2">
              <header className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">
                  {sheetName(i)}
                  {filtering && <span className="ml-2 text-xs font-normal text-brand-dark">filtered by an action</span>}
                </h3>
                <button
                  type="button"
                  aria-pressed={usesAsFilter(workbook, i)}
                  onClick={() => onChange(toggleUseAsFilter(workbook, i))}
                  title="Use as Filter: selected marks filter the other sheet"
                  className={`rounded border px-2 py-0.5 text-xs ${usesAsFilter(workbook, i) ? 'border-brand bg-brand text-chalk' : 'border-slate-300 bg-white'}`}
                >
                  ⏷ Use as Filter
                </button>
              </header>
              {isEmpty(sheet) ? (
                <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{sheetName(i)} is empty. Build a view on its tab.</p>
              ) : view === 'excluded' ? (
                <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  An action excludes all values here until you select a mark in its source sheet.
                </p>
              ) : (
                <Viz spec={view} title={sheetName(i)} onMark={(m, additive) => click(i, m, additive)} onHover={hover ? (m) => fire(i, 'hover', m.length ? [m] : []) : undefined} />
              )}
              {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    Selected: {selected.map(describe).join(' · ')}
                  </span>
                  {menus.map(({ a, index }) => (
                    <button key={index} type="button" onClick={() => runMenu(index)} className="rounded border border-brand px-2 py-0.5 text-brand-dark">
                      ▸ {a.name}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Dashboard > Actions: the list of filter actions, Add Action and the Edit Filter Action fields. */
function ActionsDialog({ workbook, onChange, onClose }: { workbook: Workbook; onChange: (next: Workbook) => void; onClose: () => void }) {
  const { actions } = workbook.dashboard
  const [edit, setEdit] = useState<{ index?: number; action: FilterAction }>()
  const setActions = (next: FilterAction[]) => onChange({ ...workbook, dashboard: { ...workbook.dashboard, actions: next } })
  const save = () => {
    if (!edit) return
    const { index, action } = edit
    setActions(index === undefined ? [...actions, action] : actions.map((a, i) => (i === index ? action : a)))
    setEdit(undefined)
  }
  const add = () => setEdit({ action: { name: newActionName(workbook), source: 0, target: 1, run: 'select', clearing: 'all' } })

  return (
    <section aria-label="Actions" className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">Actions</h3>
      {actions.length === 0 ? (
        <p className="text-slate-600">No actions. Add a filter action, or turn on Use as Filter on a sheet.</p>
      ) : (
        <table className="w-full text-left">
          <thead className="text-slate-500">
            <tr>
              <th className="font-normal">Name</th>
              <th className="font-normal">Run on</th>
              <th className="font-normal">Source</th>
              <th className="font-normal">Target</th>
              <th className="font-normal">Clearing</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {actions.map((a, i) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="py-1">{a.name}</td>
                <td>{RUN_LABELS[a.run]}</td>
                <td>{sheetName(a.source)}</td>
                <td>{sheetName(a.target)}</td>
                <td>{CLEARING_LABELS[a.clearing]}</td>
                <td className="space-x-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => setEdit({ index: i, action: a })} className="underline">
                    Edit…
                  </button>
                  <button type="button" onClick={() => setActions(actions.filter((_, j) => j !== i))} className="underline">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit ? (
        <ActionEditor workbook={workbook} action={edit.action} onChange={(action) => setEdit({ ...edit, action })} onSave={save} onCancel={() => setEdit(undefined)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={add} className="rounded border border-slate-300 px-3 py-1">
            Add Action ▸ Filter…
          </button>
          <button type="button" onClick={onClose} className="rounded bg-brand px-3 py-1 text-chalk">
            OK
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        The sandbox makes filter actions only. Highlight, URL and parameter actions are in the Dashboard actions simulator.
      </p>
    </section>
  )
}

function ActionEditor({ workbook, action, onChange, onSave, onCancel }: { workbook: Workbook; action: FilterAction; onChange: (a: FilterAction) => void; onSave: () => void; onCancel: () => void }) {
  const sheets = workbook.sheets.map((_, i) => i)
  const fields = viewDimensions(workbook.sheets[action.source]!)
  const set = (patch: Partial<FilterAction>) => onChange({ ...action, ...patch, useAsFilter: undefined })
  return (
    <fieldset className="space-y-2 rounded border border-slate-200 p-3">
      <legend className="px-1 font-semibold">Filter action</legend>
      <label className="flex items-center gap-2">
        Name <input value={action.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
      </label>
      <label className="flex items-center gap-2">
        Source sheet
        <select
          value={action.source}
          onChange={(e) => {
            const source = Number(e.target.value)
            set({ source, target: source === action.target ? sheets.find((s) => s !== source)! : action.target, fields: undefined })
          }}
          className={inputClass}
        >
          {sheets.map((s) => (
            <option key={s} value={s}>
              {sheetName(s)}
            </option>
          ))}
        </select>
      </label>
      <div role="radiogroup" aria-label="Run action on" className="flex flex-wrap items-center gap-3">
        Run action on:
        {RUN_ON.map((r) => (
          <label key={r} className="flex items-center gap-1">
            <input type="radio" name="run" checked={action.run === r} onChange={() => set({ run: r })} /> {RUN_LABELS[r]}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2">
        Target sheet
        <select value={action.target} onChange={(e) => set({ target: Number(e.target.value) })} className={inputClass}>
          {sheets
            .filter((s) => s !== action.source)
            .map((s) => (
              <option key={s} value={s}>
                {sheetName(s)}
              </option>
            ))}
        </select>
      </label>
      <div role="radiogroup" aria-label="Clearing the selection will" className="flex flex-wrap items-center gap-3">
        Clearing the selection will:
        {CLEARING.map((c) => (
          <label key={c} className="flex items-center gap-1">
            <input type="radio" name="clearing" checked={action.clearing === c} onChange={() => set({ clearing: c })} /> {CLEARING_LABELS[c]}
          </label>
        ))}
      </div>
      <div role="radiogroup" aria-label="Target filters" className="flex flex-wrap items-center gap-3">
        Target filters:
        <label className="flex items-center gap-1">
          <input type="radio" name="fields" checked={action.fields === undefined} onChange={() => set({ fields: undefined })} /> All fields
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="fields" checked={action.fields !== undefined} onChange={() => set({ fields: fields })} /> Selected fields
        </label>
      </div>
      {action.fields !== undefined && (
        <div className="flex flex-wrap gap-3 pl-4" role="group" aria-label="Selected fields">
          {fields.length === 0 && <span className="text-slate-500">The source sheet has no discrete dimensions to filter on.</span>}
          {fields.map((f) => (
            <label key={f} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={action.fields!.includes(f)}
                onChange={(e) => set({ fields: e.target.checked ? [...action.fields!, f] : action.fields!.filter((x) => x !== f) })}
              />
              {f}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={!action.name.trim()} className="rounded bg-brand px-3 py-1 text-chalk disabled:opacity-40">
          OK
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
      </div>
    </fieldset>
  )
}
