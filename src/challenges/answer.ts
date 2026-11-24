// Checking a challenge checkpoint: the learner types what their own viz shows
// in Tableau, which may be formatted (1,234 · 12.5% · 1.2K), so numbers compare
// by value within the precision either side gives, never more than 1% apart.
import type { ChallengeMeta, Fact } from '../content/schema'
import type { ChallengeRecord } from '../progress/store'

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

/** A typed number (a trailing % is dropped) and half a unit of its last digit; undefined when it isn't one. */
export function parseNumber(text: string): { value: number; tolerance: number } | undefined {
  const m = /^([-+]?)(\d+)(?:\.(\d+))?\s*([kmb]?)$/i.exec(text.trim().replace(/%$/, '').replace(/[,\s](?=\d)/g, ''))
  if (!m) return undefined
  const [, sign, whole, fraction = '', suffix = ''] = m
  const scale = SUFFIX[suffix.toLowerCase()] ?? 1
  const value = Number(`${sign}${whole}.${fraction || 0}`) * scale
  return { value, tolerance: 0.5 * 10 ** -fraction.length * scale }
}

/** Whether a typed answer matches a checkpoint's computed answer (`says`). */
export function answerMatches(input: string, answer: Fact): boolean {
  if (answer.kind === 'top') return input.trim().toLowerCase() === answer.says.trim().toLowerCase()
  const got = parseNumber(input)
  const want = parseNumber(answer.says)
  if (!got || !want) return false
  const diff = Math.abs(got.value - want.value)
  return diff <= Math.max(got.tolerance, want.tolerance) && diff <= Math.abs(want.value) * 0.01 + want.tolerance
}

/** Required steps and checkpoints done; optional steps never count against completion. */
export function challengeStatus(meta: ChallengeMeta, record: ChallengeRecord | undefined) {
  const required = meta.steps.filter((s) => !s.optional)
  const steps = required.filter((s) => record?.steps.includes(s.id)).length
  const checkpoints = meta.checkpoints.filter((c) => record?.checkpoints.includes(c.id)).length
  return {
    steps,
    stepsTotal: required.length,
    checkpoints,
    checkpointsTotal: meta.checkpoints.length,
    done: steps === required.length && checkpoints === meta.checkpoints.length,
  }
}
