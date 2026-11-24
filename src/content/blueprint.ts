// The exam blueprint, verbatim from the Salesforce Certified Tableau Desktop
// Foundations exam guide (Salesforce Help article 005298988, text captured
// 2026-11-23). Mock allocation, question targets, readiness and the content
// tests all derive from this file, so update it first when the guide changes.

export const EXAM_FORMAT = {
  name: 'Salesforce Certified Tableau Desktop Foundations',
  code: 'Analytics-101',
  items: 40,
  unscoredMax: 5,
  minutes: 70,
  /** English version. The Japanese version passes at 55%. */
  passPercent: 48,
  productVersion: '2022.3',
  feeUsd: 75,
  retakeFee: 'Free',
  prerequisite: 'None',
  audience: 'A minimum of 3 months experience applying foundational Tableau Desktop knowledge in the product.',
  delivery: 'Proctored exam delivered onsite at a testing center or in an online environment.',
  references: 'No hard-copy or online materials may be used during the exam.',
  guideUrl: 'https://help.salesforce.com/s/articleView?id=005298988&type=1',
  certificateUrl: 'https://trailheadacademy.salesforce.com/certificate/exam-tableau-desktop-found---Analytics-101',
  helpUrl: 'https://help.tableau.com/current/pro/desktop/en-us/default.htm',
} as const

export type DomainId = '1' | '2' | '3' | '4'

export interface Domain {
  id: DomainId
  title: string
  weight: number
}

export interface Objective {
  /** "2.3.5" */
  id: string
  text: string
}

export interface Task {
  /** "2.3" */
  id: string
  domainId: DomainId
  title: string
  objectives: Objective[]
}

export const DOMAINS: Domain[] = [
  { id: '1', title: 'Connecting to and Preparing Data', weight: 23 },
  { id: '2', title: 'Exploring and Analyzing Data', weight: 37 },
  { id: '3', title: 'Sharing Insights', weight: 25 },
  { id: '4', title: 'Understanding Tableau Concepts', weight: 15 },
]

const task = (id: string, title: string, objectives: string[]): Task => ({
  id,
  domainId: id[0] as DomainId,
  title,
  objectives: objectives.map((text, i) => ({ id: `${id}.${i + 1}`, text })),
})

export const TASKS: Task[] = [
  task('1.1', 'Create live connections and extracts', [
    'Create a live connection to a data source',
    'Explain the differences between using live connections versus extracts',
    'Create an extract',
    'Save metadata properties in a .TDS',
    'Create a data source that uses multiple connections',
  ]),
  task('1.2', 'Create and manage the data model', [
    'Add relationships to a data source',
    'Add joins and unions',
    'Explain when to use a join versus a relationship',
  ]),
  task('1.3', 'Manage data properties', [
    'Rename a data field',
    'Assign an alias to a data value',
    'Assign a geographic role to a data field',
    'Change data type for a data field (number, date, string, Boolean, etc.)',
    'Change default properties for a data field (number format, aggregation, color, date format, etc.)',
  ]),
  task('2.1', 'Create basic charts', [
    'Create a bar chart',
    'Create a line chart',
    'Create a scatterplot',
    'Create a map using geographic data',
    'Create a combined axis chart',
    'Create a dual axis chart',
    'Create a stacked bar',
    'Create a density map',
    'Create a chart to show specific values (crosstab, highlight table)',
  ]),
  task('2.2', 'Organize data and apply filters', [
    'Create groups by using marks, headers, and the data pane',
    'Create sets by using marks and the data pane',
    'Organize dimensions into a hierarchy',
    'Add a filter to a view',
    'Add a date filter',
  ]),
  task('2.3', 'Apply analytics to a worksheet', [
    'Add a manual or a computed sort',
    'Add a reference line',
    'Use a quick table calculation',
    'Use bins and histograms',
    'Create a calculated field (for example, string, date, simple arithmetic)',
    'Explain when to use a parameter',
    'Display totals on a worksheet',
  ]),
  task('3.1', 'Format view for presentation', [
    'Use color from the marks card',
    'Configure fonts',
    'Format marks as shapes',
    'Configure viz animations',
    'Change size of marks',
    'Show and hide legends',
  ]),
  task('3.2', 'Create and modify a dashboard', [
    'Add worksheets to a dashboard',
    'Add interactive elements for consumers (for example, show filters, data highlighter, tooltips)',
    'Add dashboard actions (for example, filter action, highlight action, parameter control, URL action)',
    'Configure a dashboard layout and create device-specific dashboards',
    'Create a story and a story point',
  ]),
  task('3.3', 'View and share workbook data', [
    'Share a workbook (for example, twbx as a PDF or an image, publish to Tableau Server)',
    'View and export underlying data',
    'Export to Microsoft PowerPoint',
  ]),
  task('4.1', 'Understand dimensions and measures', [
    'Explain what kind of information dimensions usually contain',
    'Explain what kind of information measures usually contain',
    'Explain the difference between dimensions and measures',
  ]),
  task('4.2', 'Understand discrete and continuous fields', [
    'Explain how discrete fields are displayed',
    'Explain how continuous fields are displayed',
    'Explain the difference between discrete date parts and continuous date values',
  ]),
  task('4.3', 'Understand aggregations', [
    'Explain the default aggregation for measures',
    'Describe how an aggregated measure changes when dimensions are added to a view',
  ]),
]

export const DOMAIN_BY_ID = new Map(DOMAINS.map((d) => [d.id, d]))
export const TASK_BY_ID = new Map(TASKS.map((t) => [t.id, t]))
export const OBJECTIVES = TASKS.flatMap((t) => t.objectives)
export const OBJECTIVE_BY_ID = new Map(OBJECTIVES.map((o) => [o.id, o]))

export const tasksOf = (domainId: DomainId) => TASKS.filter((t) => t.domainId === domainId)
export const taskOfObjective = (objectiveId: string) => TASK_BY_ID.get(objectiveId.split('.').slice(0, 2).join('.'))

/** Lessons follow the exam guide's order, domain by domain (PLAN.md §5). */
export const LESSON_ORDER: string[] = TASKS.map((t) => t.id)

/**
 * Splits `total` in proportion to `weights` by largest remainder; ties go to
 * the earlier entry, so the result is deterministic.
 */
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  const missing = total - out.reduce((a, b) => a + b, 0)
  for (let k = 0; k < missing; k++) out[order[k]!.i]! += 1
  return out
}

/** Mock items per domain: 9 · 15 · 10 · 6 for the 40-item exam. */
export function allocateMock(items: number = EXAM_FORMAT.items): Map<DomainId, number> {
  const counts = largestRemainder(items, DOMAINS.map((d) => d.weight))
  return new Map(DOMAINS.map((d, i) => [d.id, counts[i]!]))
}

/** Size of the whole question bank (PLAN.md §4). */
export const BANK_TARGET = 600
/** No objective may have fewer items than this. */
export const MIN_PER_OBJECTIVE = 8

/**
 * Bank target per task and per objective: the bank is split by domain weight,
 * each domain's share by its tasks' objective counts, and each task's share
 * evenly among its objectives.
 */
export const TARGETS: { tasks: Map<string, number>; objectives: Map<string, number> } = (() => {
  const tasks = new Map<string, number>()
  const objectives = new Map<string, number>()
  const perDomain = largestRemainder(BANK_TARGET, DOMAINS.map((d) => d.weight))
  DOMAINS.forEach((d, i) => {
    const ts = tasksOf(d.id)
    const perTask = largestRemainder(perDomain[i]!, ts.map((t) => t.objectives.length))
    ts.forEach((t, j) => {
      tasks.set(t.id, perTask[j]!)
      const perObjective = largestRemainder(perTask[j]!, t.objectives.map(() => 1))
      t.objectives.forEach((o, k) => objectives.set(o.id, Math.max(MIN_PER_OBJECTIVE, perObjective[k]!)))
    })
  })
  return { tasks, objectives }
})()

export const questionTarget = (objectiveId: string) => TARGETS.objectives.get(objectiveId) ?? 0

const COMPARISON = 'https://help.tableau.com/current/pro/desktop/en-us/desktop_comparison.htm'
const PUBLIC_FAQ = 'https://help.tableau.com/current/pro/desktop/en-gb/public_faq.htm'

/**
 * Objectives that Tableau Desktop Public Edition (the challenges' target) can't
 * do, or may not. `documented` entries are stated in Tableau's help;
 * `unverified` ones still need a check in Public itself (PLAN.md §3). Challenges
 * cover these with an optional Desktop Free Edition step, or, when only the
 * paid Desktop can do it, point to a simulator instead (PLAN.md §1, §7d).
 */
export const PUBLIC_LIMITS: { objectiveId: string; status: 'documented' | 'unverified'; note: string; source?: string }[] = [
  {
    objectiveId: '1.1.1',
    status: 'documented',
    note: 'Public supports extracted data sources only, no live connections (Google Sheets is refreshed automatically every 24 hours).',
    source: PUBLIC_FAQ,
  },
  { objectiveId: '1.1.4', status: 'unverified', note: 'Saving a data source as .tds is not mentioned for Public.' },
  { objectiveId: '1.1.5', status: 'unverified', note: 'Multi-table data sources exist in Public; a CSV + Excel data source with two connections is not confirmed.' },
  {
    objectiveId: '3.3.1',
    status: 'documented',
    note: 'Public can save locally or to Tableau Public, but cannot publish to Tableau Server or Tableau Cloud.',
    source: COMPARISON,
  },
  { objectiveId: '3.3.3', status: 'unverified', note: 'Export to PowerPoint is not mentioned for Public.' },
]
