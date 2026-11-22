// The committed files in public/data/ must be exactly what the generator
// produces, and the tables must be consistent with each other.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generate } from './generate'

const dir = join(import.meta.dirname, '../../public/data')
const data = generate()

describe('Driftlight dataset', () => {
  it('matches the committed files byte for byte (run npm run data:generate after changing the generator)', () => {
    expect(readdirSync(dir).sort()).toEqual(Object.keys(data.files).sort())
    for (const [name, content] of Object.entries(data.files)) {
      const committed = readFileSync(join(dir, name))
      const fresh = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
      expect(committed.equals(fresh), `${name} differs from the generator`).toBe(true)
    }
  })

  it('is deterministic', () => {
    expect(generate().files['sessions_2025.csv']).toBe(data.files['sessions_2025.csv'])
  })

  it('only has sessions by active subscribers, of titles already released', () => {
    for (const s of data.sessions) {
      const day = Date.parse(`${s.start.slice(0, 10)}T00:00:00Z`) / 86_400_000
      expect(s.subscriber.signup <= day && (s.subscriber.cancel ?? Infinity) > day, s.id).toBe(true)
      expect(s.title.releaseYear <= Number(s.start.slice(0, 4)), s.id).toBe(true)
    }
  })

  it('keeps the quirks the lessons rely on', () => {
    const subs = data.files['subscribers.csv'] as string
    expect(subs).toMatch(/,0\d{4},/) // ZIP codes with a leading zero (Boston, Newark)
    expect(subs).toMatch(/,München,/) // spelling variants to group
    const sessions = data.files['sessions_2024.csv'] as string
    expect(sessions).toMatch(/,,[A-Za-z]+,(TRUE|FALSE)\n/) // a null Minutes Watched
    expect(sessions.split('\n')[0]).toBe((data.files['sessions_2025.csv'] as string).split('\n')[0]) // union-compatible
  })
})
