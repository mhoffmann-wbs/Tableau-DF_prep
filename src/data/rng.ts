// Small seeded PRNG (mulberry32): the dataset, samplers and tests must be
// reproducible, so nothing here uses Math.random.

export type Rng = () => number

export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!

/** Picks from `[value, weight]` pairs. */
export function weighted<T>(rng: Rng, pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [value, w] of pairs) {
    r -= w
    if (r < 0) return value
  }
  return pairs[pairs.length - 1]![0]
}

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** A fresh seeded generator for one practice session or mock; tests pass a fixed seed instead. */
export const sessionRng = (): Rng => seededRng(crypto.getRandomValues(new Uint32Array(1))[0]!)
