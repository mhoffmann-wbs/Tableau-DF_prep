// The data half of the calc playground: loads the dataset and runs formulas
// over it. Loaded with a dynamic import, so the editor shows errors before any
// data arrives, and without Vega-Lite, which the playground doesn't draw.
import { loadDataset } from '../model'
import type { SourceId } from '../spec'
import { type CheckResult, checkCalc, type Preview, previewCalc, type Sheet } from './run'

export type { CheckResult, Preview }

export async function preview(sheet: Sheet, by: string[]): Promise<Preview> {
  return previewCalc(await loadDataset(), sheet, by)
}

export async function check(sheet: { source: SourceId; calcs: Sheet['calcs'] }, formula: string, expected: string, by: string[]): Promise<CheckResult> {
  return checkCalc(await loadDataset(), sheet, formula, expected, by)
}
