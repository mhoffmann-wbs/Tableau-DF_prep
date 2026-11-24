import { useState } from 'react'
import { canToggleContinuity, withContinuity } from '../engine/edit'
import { resolvePill } from '../engine/pills'
import { Shelves } from '../engine/Shelves'
import { type DateLevel, type Pill, vizSpecSchema } from '../engine/spec'
import { Viz } from '../engine/Viz'
import type { SimProps } from '.'
import { Choice } from './Choice'

export const COPY_KEYS = ['discrete', 'continuous', 'discreteColor', 'continuousColor', 'stringOnly', 'datePart', 'dateValue', 'measureDiscrete', 'role'] as const

export const FIELDS = ['Genre', 'Release Year', 'Start', 'Minutes Watched'] as const
type FieldName = (typeof FIELDS)[number]
export const LEVELS: DateLevel[] = ['year', 'quarter', 'month']

export interface BlueGreenState {
  field: FieldName
  shelf: 'columns' | 'color'
  continuous: boolean
  level: DateLevel
}

/** The pill under test (strings stay discrete) and the view around it, with `SUM(Minutes Watched)` as the other half. */
export function blueGreenView({ field, shelf, continuous, level }: BlueGreenState) {
  const toggles = canToggleContinuity('sessions', { field })
  const pill: Pill =
    field === 'Start' ? { field, date: { level, mode: continuous ? 'value' : 'part' } } : withContinuity('sessions', { field }, toggles && continuous)
  const spec = vizSpecSchema.parse(
    shelf === 'columns'
      ? { columns: [pill], rows: [{ field: field === 'Minutes Watched' ? 'Genre' : 'Minutes Watched' }] }
      : { rows: [{ field: 'Genre' }], columns: [{ field: 'Minutes Watched' }], marks: { color: pill } },
  )
  return { toggles, pill, spec }
}

/** One field on Columns or Color, switched between discrete and continuous. */
export default function BlueGreen({ copy }: SimProps) {
  const [field, setField] = useState<FieldName>('Release Year')
  const [shelf, setShelf] = useState<'columns' | 'color'>('columns')
  const [continuous, setContinuous] = useState(false)
  const [level, setLevel] = useState<DateLevel>('month')

  const isDate = field === 'Start'
  const { toggles, pill, spec } = blueGreenView({ field, shelf, continuous, level })
  const rp = resolvePill('sessions', pill)

  const notes = [
    rp.continuous ? (shelf === 'color' ? copy.continuousColor : copy.continuous) : shelf === 'color' ? copy.discreteColor : copy.discrete,
    !toggles && copy.stringOnly,
    isDate && (continuous ? copy.dateValue : copy.datePart),
    field === 'Minutes Watched' && !rp.continuous && copy.measureDiscrete,
  ].filter((n): n is string => Boolean(n))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Choice label="Field" value={field} options={FIELDS.map((f) => [f, f])} onChange={setField} />
        <Choice
          label="Shelf"
          value={shelf}
          options={[
            ['columns', 'Columns'],
            ['color', 'Color'],
          ]}
          onChange={setShelf}
        />
        <Choice
          label={isDate ? 'Date' : 'Continuity'}
          value={toggles && continuous ? 'continuous' : 'discrete'}
          options={[
            ['discrete', isDate ? 'Date part (discrete)' : 'Discrete'],
            ['continuous', isDate ? 'Date value (continuous)' : 'Continuous'],
          ]}
          disabled={!toggles}
          onChange={(v) => setContinuous(v === 'continuous')}
        />
        {isDate && <Choice label="Level" value={level} options={LEVELS.map((l) => [l, l.toUpperCase()])} onChange={setLevel} />}
      </div>
      <Shelves spec={spec} />
      <ul className="space-y-1 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm" aria-live="polite">
        <li>
          <strong>
            {rp.label} is {rp.continuous ? 'green (continuous)' : 'blue (discrete)'}, and a {rp.kind}.
          </strong>{' '}
          {copy.role}
        </li>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <Viz spec={spec} title={`${rp.label} on ${shelf === 'columns' ? 'Columns' : 'Color'}`} />
    </div>
  )
}
