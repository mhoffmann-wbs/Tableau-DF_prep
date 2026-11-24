/** A labelled row of toggle buttons: the simulators' main control. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === value}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={`rounded px-3 py-1 text-sm disabled:opacity-40 ${v === value ? 'bg-brand text-chalk' : 'border border-slate-300 text-slate-700'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
