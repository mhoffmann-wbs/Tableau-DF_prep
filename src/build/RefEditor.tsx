// The Edit Reference Line, Band or Distribution dialog: the measure's axis,
// the scope, the value(s) and the label (lesson 2.3, the help's
// "Reference Lines, Bands, Distributions, and Boxes").
import { useState } from 'react'
import { axisMeasures } from '../engine/edit'
import { resolvePill } from '../engine/pills'
import { REF_AGG_NAME } from '../engine/refs'
import { REF_AGGS, type Ref, type RefAgg, type RefValue, type VizSpec, refSchema } from '../engine/spec'

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'
const TITLE: Record<Ref['kind'], string> = { line: 'Reference Line', band: 'Reference Band', distribution: 'Reference Distribution' }
type Dist = Extract<Ref, { kind: 'distribution' }>['dist']
const DIST_NAME: Record<Dist['kind'], string> = { percentages: 'Percentages', percentiles: 'Percentiles', quantiles: 'Quantiles', stddev: 'Standard Deviation' }
/** A new computation's starting values (the help gives no defaults; the percentages are Show Me's bullet graph's). */
const NEW_DIST: Record<Dist['kind'], Dist> = {
  percentages: { kind: 'percentages', values: [60, 80], agg: 'avg' },
  percentiles: { kind: 'percentiles', values: [60, 80] },
  quantiles: { kind: 'quantiles', n: 4 },
  stddev: { kind: 'stddev', factor: 1, sample: true },
}

/** A comma-separated list of numbers ("60, 80"), or undefined when it doesn't read as one. */
function numbers(text: string): number[] | undefined {
  const xs = text.split(',').map((t) => t.trim())
  if (xs.some((t) => t === '' || !Number.isFinite(Number(t)))) return undefined
  return xs.map(Number)
}

/** Constant (with its number) or a computation, as one select. */
function ValueField({ label, value, onChange }: { label: string; value: RefValue; onChange: (v: RefValue) => void }) {
  const [text, setText] = useState(value.kind === 'constant' ? String(value.value) : '0')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        {label}
        <select
          value={value.kind === 'constant' ? 'constant' : value.agg}
          onChange={(e) => onChange(e.target.value === 'constant' ? { kind: 'constant', value: Number(text) || 0 } : { kind: 'computed', agg: e.target.value as RefAgg })}
          className={inputClass}
        >
          <option value="constant">Constant</option>
          {REF_AGGS.map((a) => (
            <option key={a} value={a}>
              {REF_AGG_NAME[a]}
            </option>
          ))}
        </select>
      </label>
      {value.kind === 'constant' && (
        <input
          aria-label={`${label} constant`}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onChange({ kind: 'constant', value: Number(e.target.value) })
          }}
          className={`${inputClass} w-32`}
        />
      )}
    </div>
  )
}

export function RefEditor({ spec, initial, onApply, onCancel, onRemove }: { spec: VizSpec; initial: Ref; onApply: (ref: Ref) => void; onCancel: () => void; onRemove?: () => void }) {
  const [ref, setRef] = useState<Ref>(initial)
  const [listText, setListText] = useState(initial.kind === 'distribution' && 'values' in initial.dist ? initial.dist.values.join(', ') : '60, 80')
  const measures = axisMeasures(spec)
  const keyOf = (p: Ref['measure']) => {
    try {
      return resolvePill(spec, p).key
    } catch {
      return p.field
    }
  }
  const patch = (p: Partial<Ref>) => setRef({ ...ref, ...p } as Ref)
  const setDist = (dist: Dist) => ref.kind === 'distribution' && setRef({ ...ref, dist })
  const parsed = refSchema.safeParse(ref)
  const listOk = ref.kind !== 'distribution' || !('values' in ref.dist) || numbers(listText) !== undefined
  const valid = parsed.success && listOk

  return (
    <section aria-label={`Edit ${TITLE[ref.kind]}`} className="space-y-3 rounded-lg border border-brand/40 bg-white p-3 text-sm">
      <h3 className="font-semibold">Edit {TITLE[ref.kind]}</h3>
      <label className="flex flex-wrap items-center gap-2">
        Axis
        <select
          value={keyOf(ref.measure)}
          onChange={(e) => patch({ measure: measures.find((m) => keyOf(m) === e.target.value)! })}
          className={inputClass}
        >
          {!measures.some((m) => keyOf(m) === keyOf(ref.measure)) && <option value={keyOf(ref.measure)}>{ref.measure.field} (not in the view)</option>}
          {measures.map((m) => (
            <option key={keyOf(m)} value={keyOf(m)}>
              {resolvePill(spec, m).label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">Scope</legend>
        <span>Scope</span>
        {(['table', 'pane', 'cell'] as const).map((sc) => (
          <label key={sc} className="flex items-center gap-1">
            <input type="radio" name="ref-scope" checked={ref.scope === sc} onChange={() => patch({ scope: sc })} />
            {sc === 'table' ? 'Entire table' : sc === 'pane' ? 'Per pane' : 'Per cell'}
          </label>
        ))}
      </fieldset>

      {ref.kind === 'line' && <ValueField label="Value" value={ref.value} onChange={(value) => setRef({ ...ref, value })} />}
      {ref.kind === 'band' && (
        <>
          <ValueField label="Band from" value={ref.from} onChange={(from) => setRef({ ...ref, from })} />
          <ValueField label="Band to" value={ref.to} onChange={(to) => setRef({ ...ref, to })} />
        </>
      )}
      {ref.kind === 'distribution' && (
        <div className="space-y-2">
          <label className="flex flex-wrap items-center gap-2">
            Computation
            <select
              value={ref.dist.kind}
              onChange={(e) => {
                const next = NEW_DIST[e.target.value as Dist['kind']]
                if ('values' in next) setListText(next.values.join(', '))
                setDist(next)
              }}
              className={inputClass}
            >
              {(Object.keys(DIST_NAME) as Dist['kind'][]).map((k) => (
                <option key={k} value={k}>
                  {DIST_NAME[k]}
                </option>
              ))}
            </select>
          </label>
          {'values' in ref.dist && (
            <label className="flex flex-wrap items-center gap-2">
              {ref.dist.kind === 'percentages' ? 'Percentages' : 'Percentiles'}
              <input
                value={listText}
                onChange={(e) => {
                  setListText(e.target.value)
                  const xs = numbers(e.target.value)
                  if (xs && ref.dist.kind !== 'quantiles' && ref.dist.kind !== 'stddev') setDist({ ...ref.dist, values: xs })
                }}
                className={`${inputClass} w-40`}
              />
            </label>
          )}
          {ref.dist.kind === 'percentages' && (
            <label className="flex flex-wrap items-center gap-2">
              Of
              <select value={ref.dist.agg} onChange={(e) => ref.dist.kind === 'percentages' && setDist({ ...ref.dist, agg: e.target.value as RefAgg })} className={inputClass}>
                {REF_AGGS.map((a) => (
                  <option key={a} value={a}>
                    {REF_AGG_NAME[a]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ref.dist.kind === 'quantiles' && (
            <label className="flex flex-wrap items-center gap-2">
              Number of tiles
              <select value={ref.dist.n} onChange={(e) => setDist({ kind: 'quantiles', n: Number(e.target.value) })} className={inputClass}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ref.dist.kind === 'stddev' && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                Factor
                <input
                  inputMode="decimal"
                  defaultValue={ref.dist.factor}
                  onChange={(e) => Number(e.target.value) > 0 && ref.dist.kind === 'stddev' && setDist({ ...ref.dist, factor: Number(e.target.value) })}
                  className={`${inputClass} w-20`}
                />
              </label>
              <label className="flex items-center gap-2">
                <select value={ref.dist.sample ? 'sample' : 'population'} onChange={(e) => ref.dist.kind === 'stddev' && setDist({ ...ref.dist, sample: e.target.value === 'sample' })} className={inputClass}>
                  <option value="sample">Sample</option>
                  <option value="population">Population</option>
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          Label
          <select value={ref.label} onChange={(e) => patch({ label: e.target.value as Ref['label'] })} className={inputClass}>
            <option value="none">None</option>
            <option value="value">Value</option>
            <option value="computation">Computation</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {ref.label === 'custom' && (
          <input aria-label="Custom label" placeholder="Target = <Value>" value={ref.custom ?? ''} onChange={(e) => patch({ custom: e.target.value })} className={`${inputClass} w-48`} />
        )}
      </div>
      {!listOk && <p className="text-red-700">Type numbers separated by commas, for example 60, 80.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!valid} onClick={() => parsed.success && onApply(parsed.data)} className="rounded bg-brand px-3 py-1 text-chalk disabled:opacity-40">
          OK
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded border border-slate-300 px-3 py-1">
            Remove
          </button>
        )}
      </div>
    </section>
  )
}
