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
