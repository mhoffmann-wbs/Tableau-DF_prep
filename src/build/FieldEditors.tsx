// The Data pane's field dialogs (lesson 1.3): Rename, Aliases, and the Default
// Properties that need more than a menu item (Comment, Number Format). Each
// returns the patch for `editField`; the Sandbox applies it.
import { type ReactNode, useState } from 'react'
import { type Field, sheetOf, type SourceRef } from '../engine/model'
import { type FieldEdit, type NumberFormat, numberFormatSchema } from '../engine/spec'
import { formatNumber } from '../engine/values'
import { useMembers } from './members'

type Patch = Partial<Omit<FieldEdit, 'field'>>

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'

function Dialog({ title, error, onApply, onCancel, extra, children }: { title: string; error?: string; onApply: () => void; onCancel: () => void; extra?: ReactNode; children: ReactNode }) {
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
        <button type="button" onClick={onApply} className="rounded bg-brand px-3 py-1 text-chalk">
          OK
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
        {extra}
      </div>
    </section>
  )
}

interface EditorProps {
  field: Field
  onApply: (patch: Patch) => void
  onCancel: () => void
  /** A problem with the last patch, such as a name that is taken. */
  error?: string
}

export function RenameEditor({ field, onApply, onCancel, error }: EditorProps) {
  const original = field.original?.name ?? field.name
  const [name, setName] = useState(field.name)
  return (
    <Dialog
      title={`Rename ${field.name}`}
      error={error}
      onApply={() => onApply({ name: name.trim() || original })}
      onCancel={onCancel}
      extra={
        field.name !== original && (
          <button type="button" onClick={() => onApply({ name: undefined })} className="rounded border border-slate-300 px-3 py-1">
            ↺ Restore “{original}”
          </button>
        )
      }
    >
      <label className="flex flex-col gap-1">
        Name
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onApply({ name: name.trim() || original })} />
      </label>
      <p className="text-xs text-slate-500">Only the name shown in this workbook changes; the data source keeps “{original}”.</p>
    </Dialog>
  )
}

const SHOWN = 200

export function AliasEditor({ field, source, onApply, onCancel }: EditorProps & { source: SourceRef }) {
  const members = useMembers(sheetOf(source), { field: field.name })
  const [draft, setDraft] = useState<Record<string, string>>(field.aliases ?? {})
  const [search, setSearch] = useState('')
  const apply = (aliases: Record<string, string>) => {
    const kept = Object.fromEntries(Object.entries(aliases).filter(([m, a]) => a.trim() !== '' && a !== m))
    onApply({ aliases: Object.keys(kept).length ? kept : undefined })
  }
  const matching = (members ?? []).filter((m) => `${m.value} ${draft[m.value as string] ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <Dialog
      title={`Edit Aliases [${field.name}]`}
      onApply={() => apply(draft)}
      onCancel={onCancel}
      extra={
        <button type="button" onClick={() => setDraft({})} className="rounded border border-slate-300 px-3 py-1">
          Clear Aliases
        </button>
      }
    >
      {!members ? (
        <p className="text-slate-500">Loading the members…</p>
      ) : (
        <>
          {members.length > 12 && <input type="search" aria-label="Search members" placeholder="Search" className={`${inputClass} w-full`} value={search} onChange={(e) => setSearch(e.target.value)} />}
          <table className="w-full text-left">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Member</th>
                <th className="py-1 font-medium">Value (Alias)</th>
              </tr>
            </thead>
            <tbody>
              {matching.slice(0, SHOWN).map((m) => {
                const member = m.value as string
                return (
                  <tr key={member}>
                    <td className="py-0.5 pr-2">{member}</td>
                    <td className="py-0.5">
                      <input
                        aria-label={`Alias for ${member}`}
                        className={`${inputClass} w-full`}
                        value={draft[member] ?? member}
                        onChange={(e) => setDraft({ ...draft, [member]: e.target.value })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {matching.length > SHOWN && <p className="text-xs text-slate-500">…and {matching.length - SHOWN} more. Search to narrow the list.</p>}
        </>
      )}
    </Dialog>
  )
}

export function CommentEditor({ field, onApply, onCancel }: EditorProps) {
  const [comment, setComment] = useState(field.comment ?? '')
  return (
    <Dialog title={`Edit Comment [${field.name}]`} onApply={() => onApply({ comment: comment.trim() || undefined })} onCancel={onCancel}>
      <label className="flex flex-col gap-1">
        Comment
        <textarea rows={3} className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <p className="text-xs text-slate-500">The comment shows when you point at the field in the Data pane.</p>
    </Dialog>
  )
}

type FormatChoice = 'automatic' | NumberFormat['kind']

const FORMAT_NAME: Record<FormatChoice, string> = { automatic: 'Automatic', number: 'Number (Custom)', currency: 'Currency (Custom)', percent: 'Percentage' }

export function NumberFormatEditor({ field, onApply, onCancel }: EditorProps) {
  const [choice, setChoice] = useState<FormatChoice>(field.format?.kind ?? 'automatic')
  const [format, setFormat] = useState<NumberFormat>(field.format ?? numberFormatSchema.parse({}))
  const set = (patch: Partial<NumberFormat>) => setFormat({ ...format, ...patch })
  const pick = (c: FormatChoice) => {
    setChoice(c)
    if (c === 'currency' && format.prefix === '') set({ kind: c, prefix: '$', decimals: 2 })
    else if (c === 'percent') set({ kind: c, units: '' })
    else if (c === 'number') set({ kind: c, prefix: format.kind === 'currency' && format.prefix === '$' ? '' : format.prefix })
  }
  const sample = choice === 'percent' ? 0.2567 : 23456.789
  return (
    <Dialog title={`Default Number Format [${field.name}]`} onApply={() => onApply({ format: choice === 'automatic' ? undefined : format })} onCancel={onCancel}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Format
          <select className={inputClass} value={choice} onChange={(e) => pick(e.target.value as FormatChoice)}>
            {(Object.keys(FORMAT_NAME) as FormatChoice[]).map((c) => (
              <option key={c} value={c}>
                {FORMAT_NAME[c]}
              </option>
            ))}
          </select>
        </label>
        {choice !== 'automatic' && (
          <>
            <label className="flex flex-col gap-1">
              Decimal places
              <input type="number" min={0} max={6} className={`${inputClass} w-20`} value={format.decimals} onChange={(e) => set({ decimals: Math.min(6, Math.max(0, Number(e.target.value) || 0)) })} />
            </label>
            {choice !== 'percent' && (
              <label className="flex flex-col gap-1">
                Display units
                <select className={inputClass} value={format.units} onChange={(e) => set({ units: e.target.value as NumberFormat['units'] })}>
                  <option value="">None</option>
                  <option value="K">Thousands (K)</option>
                  <option value="M">Millions (M)</option>
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              Prefix
              <input className={`${inputClass} w-20`} value={format.prefix} onChange={(e) => set({ prefix: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              Suffix
              <input className={`${inputClass} w-20`} value={format.suffix} onChange={(e) => set({ suffix: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 self-center">
              <input type="checkbox" checked={format.separators} onChange={(e) => set({ separators: e.target.checked })} />
              Include thousands separators
            </label>
          </>
        )}
      </div>
      <p className="text-slate-600">
        Example: <span className="font-mono">{choice === 'automatic' ? sample.toLocaleString('en') : formatNumber(sample, { ...format, kind: choice })}</span>
      </p>
      <p className="text-xs text-slate-500">Axes, labels and tooltips use the format wherever the field is a continuous number.</p>
    </Dialog>
  )
}
