import { useEffect, useState } from 'react'
import { isCompleteFilter } from '../engine/edit'
import { fieldOf } from '../engine/model'
import { AGG_LABEL } from '../engine/pills'
import type { Member } from '../engine/runtime'
import { AGGREGATIONS, type Aggregation, type DateLevel, type Filter, type SourceId } from '../engine/spec'

/** Long member lists (Title, Subscriber ID) show this many until the search narrows them. */
const SHOWN = 200

const PART_LEVELS: [DateLevel, string][] = [
  ['year', 'Years'],
  ['quarter', 'Quarters'],
  ['month', 'Months'],
  ['week', 'Week numbers'],
  ['day', 'Days'],
  ['weekday', 'Weekdays'],
]

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

/** The filter dialog: pick members, a range of values, date parts or a range of dates. */
export function FilterEditor({
  source,
  initial,
  onApply,
  onCancel,
  onRemove,
}: {
  source: SourceId
  initial: Filter
  onApply: (f: Filter) => void
  onCancel: () => void
  /** Set when the filter is already on the shelf. */
  onRemove?: () => void
}) {
  const [draft, setDraft] = useState<Filter>(initial)
  const field = fieldOf(source, draft.field)
  const isDate = field?.type === 'date' || field?.type === 'datetime'

  return (
    <section aria-label={`Filter ${draft.field}`} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">Filter [{draft.field}]</h3>
      {isDate && (
        <div role="radiogroup" aria-label="Filter dates by" className="flex flex-wrap gap-3">
          {(
            [
              ['datePart', 'Date parts'],
              ['dateRange', 'Range of dates'],
            ] as const
          ).map(([kind, name]) => (
            <label key={kind} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="date-filter-kind"
                checked={draft.kind === kind}
                onChange={() => setDraft(kind === 'datePart' ? { kind, field: draft.field, level: 'year', values: [] } : { kind, field: draft.field })}
              />
              {name}
            </label>
          ))}
        </div>
      )}
      {draft.kind === 'values' && <MemberPicker source={source} draft={draft} onChange={setDraft} />}
      {draft.kind === 'datePart' && (
        <>
          <label className="flex items-center gap-2">
            Keep
            <select
              className={inputClass}
              value={draft.level}
              onChange={(e) => setDraft({ ...draft, level: e.target.value as DateLevel, values: [] })}
            >
              {PART_LEVELS.map(([l, name]) => (
                <option key={l} value={l}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <MemberPicker source={source} draft={draft} onChange={setDraft} />
        </>
      )}
      {draft.kind === 'range' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            Aggregation
            <select
              className={inputClass}
              value={draft.agg ?? ''}
              onChange={(e) => setDraft({ ...draft, agg: (e.target.value || undefined) as Aggregation | undefined })}
            >
              <option value="">All values (each row)</option>
              {AGGREGATIONS.filter((a) => a !== 'attr').map((a) => (
                <option key={a} value={a}>
                  {AGG_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <NumberInput label="At least" value={draft.min} onChange={(min) => setDraft({ ...draft, min })} />
          <NumberInput label="At most" value={draft.max} onChange={(max) => setDraft({ ...draft, max })} />
        </div>
      )}
      {draft.kind === 'dateRange' && (
        <div className="flex flex-wrap gap-3">
          {(['from', 'to'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              {k === 'from' ? 'Starting date' : 'Ending date'}
              <input type="date" className={inputClass} value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value || undefined })} />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!isCompleteFilter(draft)}
          onClick={() => onApply(draft)}
          className="rounded bg-brand px-3 py-1 text-chalk disabled:opacity-40"
        >
          Apply filter
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded border border-slate-300 px-3 py-1 text-red-700">
            Remove filter
          </button>
        )}
      </div>
    </section>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type="number"
        className={`${inputClass} w-32`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </label>
  )
}

type MemberFilter = Extract<Filter, { kind: 'values' | 'datePart' }>

/** Checkboxes for the members of a field or date part, loaded from the data. */
function MemberPicker({ source, draft, onChange }: { source: SourceId; draft: MemberFilter; onChange: (f: MemberFilter) => void }) {
  const level = draft.kind === 'datePart' ? draft.level : undefined
  const loadKey = `${source}|${draft.field}|${level ?? ''}`
  const [loaded, setLoaded] = useState<{ key: string; members: Member[] }>()
  const [search, setSearch] = useState('')
  const members = loaded?.key === loadKey ? loaded.members : undefined

  useEffect(() => {
    let cancelled = false
    const pill = level ? { field: draft.field, date: { level, mode: 'part' as const } } : { field: draft.field }
    import('../engine/runtime')
      .then((m) => m.membersOf(source, pill))
      .then((list) => !cancelled && setLoaded({ key: loadKey, members: list }))
    return () => {
      cancelled = true
    }
  }, [loadKey, source, draft.field, level])

  if (!members) return <p className="text-slate-500">Loading the members…</p>
  const selected = new Set<string | number>(draft.values)
  const toggle = (v: string | number) => {
    const values = selected.has(v) ? draft.values.filter((x) => x !== v) : [...draft.values, v]
    onChange({ ...draft, values } as MemberFilter)
  }
  const matching = members.filter((m) => m.label.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <div className="space-y-2">
      {members.length > 12 && (
        <input type="search" aria-label="Search members" placeholder="Search" className={`${inputClass} w-full`} value={search} onChange={(e) => setSearch(e.target.value)} />
      )}
      <div className="flex gap-2 text-xs">
        <button type="button" className="text-brand-dark underline" onClick={() => onChange({ ...draft, values: matching.map((m) => m.value) } as MemberFilter)}>
          {search ? 'Select matching' : 'Select all'}
        </button>
        <button type="button" className="text-brand-dark underline" onClick={() => onChange({ ...draft, values: [] } as MemberFilter)}>
          None
        </button>
      </div>
      <ul className="max-h-56 overflow-y-auto rounded border border-slate-200 p-2">
        {matching.slice(0, SHOWN).map((m) => (
          <li key={String(m.value)}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(m.value)} onChange={() => toggle(m.value)} />
              {m.label}
            </label>
          </li>
        ))}
        {matching.length > SHOWN && <li className="text-xs text-slate-500">…and {matching.length - SHOWN} more. Search to narrow the list.</li>}
      </ul>
      {draft.kind === 'values' && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.exclude ?? false} onChange={(e) => onChange({ ...draft, exclude: e.target.checked || undefined })} />
          Exclude the selected members
        </label>
      )}
    </div>
  )
}
