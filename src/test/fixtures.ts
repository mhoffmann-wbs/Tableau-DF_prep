// One valid item per kind, for schema and UI tests.
import type { Item } from '../content/schema'

const opt = (text: string, correct = false) => ({ text, correct, rationale: `Because ${text.toLowerCase()}.` })

export const SINGLE: Item = {
  id: '4.1-001',
  kind: 'single',
  taskId: '4.1',
  objectives: ['4.1.1'],
  stem: 'Which field is most likely a dimension?',
  options: [opt('Genre', true), opt('Minutes Watched'), opt('Monthly Price'), opt('Runtime')],
  explanation: 'Dimensions hold qualitative values that categorise data.',
}

export const MULTI: Item = {
  id: '4.1-002',
  kind: 'multi',
  taskId: '4.1',
  objectives: ['4.1.2'],
  select: 2,
  stem: 'Which fields are most likely measures? (Choose 2 answers.)',
  options: [opt('Minutes Watched', true), opt('Monthly Price', true), opt('Country'), opt('Device'), opt('Title')],
  explanation: 'Measures hold numeric values that can be aggregated.',
}

export const VIZ: Item = {
  id: '4.2-001',
  kind: 'viz',
  taskId: '4.2',
  objectives: ['4.2.3'],
  select: 1,
  stem: 'What kind of date field is on Columns?',
  options: [opt('A continuous date value', true), opt('A discrete date part'), opt('A dimension filter'), opt('A measure')],
  explanation: 'A continuous date value draws an axis.',
  viz: {
    show: 'both',
    spec: {
      source: 'sessions',
      calcs: [],
      fields: [],
      columns: [{ field: 'Start', date: { level: 'month', mode: 'value' } }],
      rows: [{ field: 'Minutes Watched', agg: 'sum' }],
      marks: { type: 'line', detail: [], tooltip: [] },
      filters: [],
    },
  },
}

/** A copy of `base` filed under `taskId`, numbered `n`. */
export const fakeItem = (taskId: string, n: number, base: Item = SINGLE): Item => ({
  ...base,
  id: `${taskId}-${String(n).padStart(3, '0')}`,
  taskId,
  objectives: [`${taskId}.1`],
  stem: `${base.stem} (${taskId} #${n})`,
})

/** `perTask` single-answer items for every task in the guide. */
export const fakeBank = (perTask: number): Item[] =>
  ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3'].flatMap((t) =>
    Array.from({ length: perTask }, (_, i) => fakeItem(t, i + 1)),
  )
