// Concept simulators (PLAN.md §7c). The simulators are components under
// src/sims/; their copy is data, one file per simulator in sims/: the intro, the texts each
// component asks for by key, and the 2–3 bank items that end the simulator.
// Tableau facts in the copy come from the lessons of the simulator's tasks.
import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)

export const simSchema = z.object({
  /** Stable slug, used in the URL. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: nonEmpty,
  /** One line for the Build page. */
  summary: nonEmpty,
  objectives: z.array(z.string().regex(/^\d\.\d\.\d$/)).min(1),
  intro: nonEmpty,
  /** Texts the component shows, by key (the registry lists the keys each one needs). */
  copy: z.record(z.string(), nonEmpty),
  /** Bank items that close the simulator. */
  items: z.array(z.string()).min(2).max(3),
})

export type Sim = z.infer<typeof simSchema>

export const SIM_ORDER = ['granularity', 'blue-green', 'live-extract', 'data-model', 'filter-order', 'group-set', 'dashboard-actions']

const files = import.meta.glob<unknown>('./sims/*.json', { eager: true, import: 'default' })

/** In SIM_ORDER, which follows the learning order. */
export const SIMS: Sim[] = Object.values(files)
  .map((data) => simSchema.parse(data))
  .sort((a, b) => SIM_ORDER.indexOf(a.id) - SIM_ORDER.indexOf(b.id))
export const SIM_BY_ID = new Map(SIMS.map((s) => [s.id, s]))
