import { useState } from 'react'
import { SOURCE_INFO } from '../engine/model'
import { AGG_LABEL } from '../engine/pills'
import { AGGREGATIONS, type Aggregation, type Pill, type SourceId } from '../engine/spec'

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

/** The sort dialog of a discrete pill: by its own members, or computed from a measure. */
export function SortEditor({ source, pill, onApply, onCancel }: { source: SourceId; pill: Pill; onApply: (p: Pill) => void; onCancel: () => void }) {
  const measures = SOURCE_INFO[source].fields.filter((f) => f.role === 'measure' && !f.generated)
  const [by, setBy] = useState<'members' | 'field'>(pill.sort?.field ? 'field' : 'members')
  const [order, setOrder] = useState<'asc' | 'desc'>(pill.sort?.order ?? 'asc')
  const [field, setField] = useState(pill.sort?.field ?? measures[0]!.name)
  const [agg, setAgg] = useState<Aggregation>(pill.sort?.agg ?? measures.find((m) => m.name === field)?.agg ?? 'sum')
  const { sort: _sort, ...unsorted } = pill

  return (
    <section aria-label={`Sort ${pill.field}`} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">Sort [{pill.field}]</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Sort by
          <select className={inputClass} value={by} onChange={(e) => setBy(e.target.value as 'members' | 'field')}>
            <option value="members">Its own members (A to Z, or in time order)</option>
            <option value="field">Field</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Sort order
          <select className={inputClass} value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
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
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApply({ ...unsorted, sort: by === 'field' ? { order, field, agg } : { order } })}
          className="rounded bg-brand px-3 py-1 text-chalk"
        >
          Apply sort
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
        {pill.sort && (
          <button type="button" onClick={() => onApply(unsorted)} className="rounded border border-slate-300 px-3 py-1">
            Clear sort
          </button>
        )}
      </div>
    </section>
  )
}
