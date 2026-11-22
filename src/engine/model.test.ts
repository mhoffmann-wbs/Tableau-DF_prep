import { describe, expect, it } from 'vitest'
import { testDataset } from '../test/dataset'
import { SOURCE_INFO, parseCsv } from './model'
import { SOURCES } from './spec'

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n,\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['', '']])
  })
})

describe('dataset', () => {
  const data = testDataset()

  it('has one row per session, subscriber and title', () => {
    expect(data.sessions).toHaveLength(32000)
    expect(data.subscribers).toHaveLength(3000)
    expect(data.titles).toHaveLength(400)
  })

  it('joins every lookup without duplicating rows', () => {
    for (const r of data.sessions) {
      expect(r['Genre'], String(r['Session ID'])).toBeTruthy()
      expect(r['Region'], String(r['Session ID'])).toBeTruthy()
      expect(r['Plan'], String(r['Session ID'])).toBeTruthy()
    }
    expect(data.subscribers.filter((r) => r['Cancel Date'] !== null)).toHaveLength(424)
  })

  it('types values: strings keep leading zeros, empties are null, dates are UTC ms', () => {
    expect(data.subscribers.some((r) => typeof r['Postal Code'] === 'string' && r['Postal Code'].startsWith('0'))).toBe(true)
    expect(data.sessions.filter((r) => r['Minutes Watched'] === null).length).toBeGreaterThan(0)
    expect(data.sessions[0]!['Start']).toBe(Date.UTC(2024, 0, 1, 10, 10, 11))
    expect(typeof data.sessions[0]!['Completed']).toBe('boolean')
  })

  it.each(SOURCES)('lists every %s field present in the rows', (source) => {
    const row = data[source][0]!
    for (const f of SOURCE_INFO[source].fields.filter((x) => !x.generated)) expect(f.name in row, f.name).toBe(true)
  })
})
