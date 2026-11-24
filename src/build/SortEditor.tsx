import { useState } from 'react'
import { fieldsOf, sheetOf, type SourceRef } from '../engine/model'
import { AGG_LABEL } from '../engine/pills'
import { AGGREGATIONS, type Aggregation, type Pill, type Sort } from '../engine/spec'
import { manualKey, useMembers } from './members'

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

type By = 'members' | 'field' | 'manual'

/**
 * The sort dialog of a discrete pill, or of a dimension's Default Properties >
 * Sort: by its own members, computed from a measure, or in a manual order.
 */
export function SortEditor({
  source,
  pill,
  scope = 'pill',
  initial,
  onApply,
  onCancel,
}: {
  source: SourceRef
  /** The pill whose members are sorted (for a default sort, the bare field). */
  pill: Pill
  /** A pill's own sort, or the field's Default Properties > Sort. */
  scope?: 'pill' | 'default'
  initial: Sort | undefined
  onApply: (sort: Sort | undefined) => void
  onCancel: () => void
}) {
  const measures = fieldsOf(source).filter((f) => f.role === 'measure' && !f.generated && !f.calc?.error)
  const [by, setBy] = useState<By>(initial?.manual ? 'manual' : initial?.field ? 'field' : 'members')
  const [order, setOrder] = useState<'asc' | 'desc'>(initial?.order ?? 'asc')
  const [field, setField] = useState(initial?.field ?? measures[0]!.name)
  const [agg, setAgg] = useState<Aggregation>(initial?.agg ?? measures.find((m) => m.name === field)?.agg ?? 'sum')
  const [manual, setManual] = useState<string[]>()

  const sort = (): Sort | undefined => {
    if (by === 'field') return { order, field, agg }
    if (by === 'manual') return manual ? { order: 'asc', manual } : initial
    return { order }
  }

  return (
    <section aria-label={`${scope === 'default' ? 'Default sort' : 'Sort'} ${pill.field}`} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">
        {scope === 'default' ? 'Default Sort' : 'Sort'} [{pill.field}]
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Sort by
          <select className={inputClass} value={by} onChange={(e) => setBy(e.target.value as By)}>
            <option value="members">Its own members (A to Z, or in time order)</option>
            <option value="field">Field</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        {by !== 'manual' && (
          <label className="flex flex-col gap-1">
            Sort order
            <select className={inputClass} value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        )}
        {by === 'field' && (
          <>
            <label className="flex flex-col gap-1">
              Field name
              <select
                className={inputClass}
                value={field}
                onChange={(e) => {
                  setField(e.target.value)
                  setAgg(measures.find((m) => m.name === e.target.value)?.agg ?? 'sum')
                }}
              >
                {measures.map((m) => (
                  <option key={m.name}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Aggregation
              <select className={inputClass} value={agg} onChange={(e) => setAgg(e.target.value as Aggregation)}>
                {AGGREGATIONS.filter((a) => a !== 'attr').map((a) => (
                  <option key={a} value={a}>
                    {AGG_LABEL[a]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {by === 'manual' && <ManualOrder source={source} pill={pill} order={manual} onChange={setManual} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onApply(sort())} className="rounded bg-brand px-3 py-1 text-chalk">
          Apply sort
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
        {initial && (
          <button type="button" onClick={() => onApply(undefined)} className="rounded border border-slate-300 px-3 py-1">
            Clear sort
          </button>
        )}
      </div>
    </section>
  )
}

/** Manual: the members in their current order, each with Move up and Move down. */
function ManualOrder({ source, pill, order, onChange }: { source: SourceRef; pill: Pill; order: string[] | undefined; onChange: (o: string[]) => void }) {
  const members = useMembers(sheetOf(source), pill)
  if (!members) return <p className="text-slate-500">Loading the members…</p>
  const labels = new Map(members.map((m) => [manualKey(m), m.label]))
  const list = order ?? members.map(manualKey)
  const move = (i: number, by: -1 | 1) => {
    const next = [...list]
    ;[next[i], next[i + by]] = [next[i + by]!, next[i]!]
    onChange(next)
  }
  if (list.length > 60) return <p className="text-slate-500">This field has {list.length} members, too many to order by hand. Sort it by a field instead.</p>
  return (
    <ol aria-label="Manual order" className="max-h-64 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-2">
      {list.map((m, i) => (
        <li key={m} className="flex items-center gap-2">
          <span className="w-6 text-right text-xs text-slate-400">{i + 1}</span>
          <span className="flex-1">{labels.get(m) ?? m}</span>
          <button type="button" aria-label={`Move ${labels.get(m) ?? m} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-30">
            Move up
          </button>
          <button
            type="button"
            aria-label={`Move ${labels.get(m) ?? m} down`}
            disabled={i === list.length - 1}
            onClick={() => move(i, 1)}
            className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-30"
          >
            Move down
          </button>
        </li>
      ))}
    </ol>
  )
}
