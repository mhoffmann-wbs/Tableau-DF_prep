// The engine dataset built from the committed CSVs, and the generator's typed
// rows as an independent reference. Both are built once per test file.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generate } from '../data/generate'
import { DATA_FILES, type Dataset, buildDataset } from '../engine/model'

let dataset: Dataset | undefined
export function testDataset(): Dataset {
  const dir = join(import.meta.dirname, '../../public/data')
  dataset ??= buildDataset(Object.fromEntries(DATA_FILES.map((f) => [f, readFileSync(join(dir, f), 'utf8')])))
  return dataset
}

let reference: ReturnType<typeof generate> | undefined
export const referenceData = () => (reference ??= generate())
