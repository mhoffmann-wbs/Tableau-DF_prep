import { type ReactNode, useRef } from 'react'
import { Link } from 'react-router'
import { CalcError, CATEGORY_LABEL, FUNCTIONS, type FunctionDef } from '../engine/calc'
import { calcFields, type Field, fieldsOf } from '../engine/model'
import type { Calc, SourceId } from '../engine/spec'

/** The sheet a formula is written in: a data source and the other calcs it may use. */
export interface CalcSheet {
  source: SourceId
  calcs: Calc[]
}

/** What a formula compiles to on a sheet: the field it becomes, or the error that stops it. */
export function calcStatus(sheet: CalcSheet, name: string, formula: string): { field: Field } | { error: CalcError } {
  const others = sheet.calcs.filter((c) => c.name !== name)
  const field = calcFields(sheet.source, [...others, { name: name.trim() || 'Calculation', formula }]).at(-1)!
  return field.calc?.error ? { error: field.calc.error } : { field }
}

const TYPE_WORD: Record<Field['type'], string> = { number: 'a number', string: 'a string', boolean: 'TRUE or FALSE', date: 'a date', datetime: 'a date and time' }

function describeField(field: Field): string {
  const compiled = field.calc!.compiled!
  if (compiled.aggregate) return `Aggregate calculation that returns ${TYPE_WORD[field.type]}. It becomes a measure shown as AGG(${field.name}), computed again for every mark.`
  if (field.role === 'measure') return `Row-level calculation that returns ${TYPE_WORD[field.type]}, computed for every row. It becomes a measure, aggregated as SUM by default.`
  return `Row-level calculation that returns ${TYPE_WORD[field.type]}, computed for every row. It becomes a dimension.`
}

/** The formula with the error's span marked. */
function ErrorExcerpt({ formula, error }: { formula: string; error: CalcError }) {
  if (!error.span || formula.trim() === '') return null
  const { start, end } = error.span
  const mark = formula.slice(start, end) || ' '
  return (
    <pre className="mt-1 overflow-x-auto rounded bg-white/70 p-2 font-mono text-xs whitespace-pre-wrap">
      {formula.slice(0, start)}
      <mark className="rounded bg-red-200 px-0.5 text-red-900 underline decoration-wavy">{mark}</mark>
      {formula.slice(end)}
    </pre>
  )
}

export function CalcStatus({ sheet, name, formula }: { sheet: CalcSheet; name: string; formula: string }) {
  if (formula.trim() === '') return <p className="text-sm text-slate-500">Type a formula. Field names go in square brackets, such as [Minutes Watched].</p>
  const status = calcStatus(sheet, name, formula)
  if ('field' in status)
    return (
      <p className="rounded border border-green-600/40 bg-green-50 p-2 text-sm text-green-900">
        <span className="font-semibold">The calculation is valid.</span> {describeField(status.field)}
      </p>
    )
  const { error } = status
  return (
    <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
      <p className="font-semibold">{error.message}</p>
      <ErrorExcerpt formula={formula} error={error} />
      {error.explain && <p className="mt-1">{error.explain}</p>}
      <p className="mt-1 text-xs">
        {error.kind === 'mix' ? (
          <>
            Read more: <Link to="/learn/2.3" className="underline">calculated fields (lesson 2.3)</Link> and{' '}
            <Link to="/learn/4.3" className="underline">aggregation (lesson 4.3)</Link>.
          </>
        ) : (
          <>
            Read more: <Link to="/learn/2.3" className="underline">calculated fields (lesson 2.3)</Link>.
          </>
        )}
      </p>
    </div>
  )
}

const inputClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm'
const CATEGORIES = Object.keys(CATEGORY_LABEL) as FunctionDef['category'][]

/**
 * The calculation editor: a name, the formula, and lists of fields and
 * functions that insert themselves at the cursor. The status under the formula
 * updates as you type.
 */
export function CalcEditor({
  sheet,
  name,
  onName,
  formula,
  onFormula,
  highlight = [],
  footer,
}: {
  sheet: CalcSheet
  name: string
  /** Leave out to show the name as fixed. */
  onName?: (name: string) => void
  formula: string
  onFormula: (formula: string) => void
  /** Fields to list first (an exercise's fields). */
  highlight?: string[]
  footer?: ReactNode
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const insert = (text: string) => {
    const el = area.current
    const start = el?.selectionStart ?? formula.length
    const end = el?.selectionEnd ?? formula.length
    onFormula(formula.slice(0, start) + text + formula.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + text.length, start + text.length)
    })
  }
  const fields = fieldsOf(sheet).filter((f) => f.name !== name && !f.generated && !f.calc?.error && !f.name.endsWith('(Count)'))
  const ordered = [...fields.filter((f) => highlight.includes(f.name)), ...fields.filter((f) => !highlight.includes(f.name))]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 space-y-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          {onName ? (
            <input className={inputClass} value={name} onChange={(e) => onName(e.target.value)} />
          ) : (
            <span className="font-normal text-slate-700">{name}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Formula
          <textarea
            ref={area}
            value={formula}
            onChange={(e) => onFormula(e.target.value)}
            rows={5}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="rounded border border-slate-300 bg-white p-2 font-mono text-sm"
          />
        </label>
        <div aria-live="polite">
          <CalcStatus sheet={sheet} name={name} formula={formula} />
        </div>
        {footer}
      </div>
      <div className="space-y-2 text-sm">
        <details open className="rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer font-semibold">Fields</summary>
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {ordered.map((f) => (
              <li key={f.name}>
                <button
                  type="button"
                  onClick={() => insert(`[${f.name.replace(/]/g, ']]')}]`)}
                  className={`w-full rounded px-1 text-left hover:bg-slate-100 ${f.role === 'dimension' ? 'text-discrete' : 'text-continuous'} ${highlight.includes(f.name) ? 'font-semibold' : ''}`}
                >
                  {f.calc ? '= ' : ''}
                  {f.name}
                  <span className="sr-only"> (insert)</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
        <details className="rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer font-semibold">Functions</summary>
          {CATEGORIES.map((cat) => (
            <div key={cat} className="mt-2">
              <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{CATEGORY_LABEL[cat]}</h4>
              <ul>
                {FUNCTIONS.filter((fn) => fn.category === cat).map((fn) => (
                  <li key={fn.name} className="py-0.5">
                    <button type="button" onClick={() => insert(`${fn.name}(`)} className="w-full rounded px-1 text-left font-mono text-xs text-brand-dark hover:bg-slate-100">
                      {fn.syntax}
                      <span className="sr-only"> (insert)</span>
                    </button>
                    <p className="px-1 text-xs text-slate-600">
                      {fn.summary} <code className="text-slate-500">{fn.example}</code>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      </div>
    </div>
  )
}
