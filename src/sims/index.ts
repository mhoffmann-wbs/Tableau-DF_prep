import { type ComponentType, lazy } from 'react'

/** What every simulator component receives: its copy from content/sims/<id>.json. */
export interface SimProps {
  copy: Record<string, string>
}

/** A simulator module: the component, and the copy keys it reads (the content test checks the JSON has exactly these). */
export interface SimModule {
  default: ComponentType<SimProps>
  COPY_KEYS: readonly string[]
}

const LOADERS: Record<string, () => Promise<SimModule>> = {
  granularity: () => import('./Granularity'),
  'blue-green': () => import('./BlueGreen'),
  'live-extract': () => import('./LiveExtract'),
  'data-model': () => import('./DataModel'),
  'filter-order': () => import('./FilterOrder'),
  'group-set': () => import('./GroupSet'),
  'dashboard-actions': () => import('./DashboardActions'),
}

// Each simulator is its own chunk, loaded when its page opens.
export const SIM_COMPONENTS: Record<string, { load: () => Promise<SimModule>; component: ComponentType<SimProps> }> = Object.fromEntries(
  Object.entries(LOADERS).map(([id, load]) => [id, { load, component: lazy(load) }]),
)
