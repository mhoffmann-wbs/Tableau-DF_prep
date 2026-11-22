// Generates the Driftlight dataset (PLAN.md §6a) from a fixed seed. Pure: it
// returns file contents, and scripts/generate-data.ts writes them. Places and
// coordinates are real so geographic roles work; people, titles and figures
// are invented. Changing anything here moves every number the content cites,
// so regenerate and rerun the tests.
import { type Rng, pick, randInt, seededRng, weighted } from './rng.ts'
import { COUNTRIES, type City, type Country, REGIONS } from './geography.ts'
import { type Cell, writeXlsx } from './xlsx.ts'

export const SEED = 20261123
export const FIRST_SESSION_DAY = '2024-01-01'
export const LAST_DAY = '2025-12-31'

export const PLANS = [
  { code: 'BAS', plan: 'Basic', price: 7.99, screens: 1, ads: false, weight: 25 },
  { code: 'STD', plan: 'Standard', price: 13.99, screens: 2, ads: false, weight: 35 },
  { code: 'PRM', plan: 'Premium', price: 19.99, screens: 4, ads: false, weight: 20 },
  { code: 'ADS', plan: 'Basic with Ads', price: 5.99, screens: 1, ads: true, weight: 20 },
] as const

export const GENRES: Record<string, string[]> = {
  Drama: ['Crime Drama', 'Legal Drama', 'Period Drama'],
  Comedy: ['Sitcom', 'Romantic Comedy', 'Satire'],
  Documentary: ['Nature', 'True Crime', 'History'],
  'Sci-Fi & Fantasy': ['Space Opera', 'Dystopian', 'Fantasy'],
  Thriller: ['Psychological', 'Action Thriller', 'Mystery'],
  'Kids & Family': ['Animation', 'Live Action'],
}

const ADJECTIVES = ['Quiet', 'Copper', 'Hollow', 'Velvet', 'Restless', 'Paper', 'Crooked', 'Amber', 'Midnight', 'Distant', 'Glass', 'Salted', 'Northern', 'Feral', 'Gilded', 'Lantern', 'Marble', 'Wandering', 'Ashen', 'Electric']
const NOUNS = ['Harbor', 'Orchard', 'Signal', 'Lighthouse', 'Archive', 'Meridian', 'Tide', 'Foxglove', 'Engine', 'Garden', 'Comet', 'Ledger', 'Canyon', 'Parade', 'Circuit', 'Ember', 'Atlas', 'Hive', 'Kettle', 'Bridge']
const PLACES = ['Larkspur', 'Wrenfield', 'Ostmoor', 'Calder Bay', 'Port Ninian', 'Vellmar', 'Ashby Cross', 'Tamsin Hill']

const DEVICES = [['TV', 42], ['Mobile', 26], ['Web', 14], ['Tablet', 11], ['Console', 7]] as const
const AGE_BANDS = [['18-24', 18], ['25-34', 30], ['35-44', 24], ['45-54', 16], ['55+', 12]] as const
const CHANNELS = [['Organic', 38], ['Referral', 18], ['Paid Social', 24], ['Partner Bundle', 20]] as const
const REASONS = [['Price', 34], ['Not enough content', 24], ['Switched service', 18], ['Technical issues', 9], ['Other', 15]] as const
/** Seasonality by month (Jan..Dec) and weekday (Sun..Sat). */
const MONTH_FACTOR = [1.1, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 0.9, 0.95, 1.0, 1.1, 1.3]
const WEEKDAY_FACTOR = [1.3, 1.0, 1.0, 1.0, 1.0, 1.15, 1.3]
const HOUR_WEIGHTS = [3, 2, 1, 1, 1, 1, 1, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 6, 8, 11, 13, 12, 9, 5]

const DAY_MS = 86_400_000
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10)
const round = (x: number, digits: number) => Number(x.toFixed(digits))
const pad = (n: number, width: number) => String(n).padStart(width, '0')

export interface Subscriber {
  id: string
  signup: number
  plan: string
  country: Country
  city: City
  cityLabel: string
  postal: string
  lat: number
  lon: number
  ageBand: string
  channel: string
  cancel?: number
  reason?: string
}

export interface Title {
  id: string
  title: string
  type: 'Movie' | 'Series'
  genre: string
  subGenre: string
  releaseYear: number
  rating: string
  runtime: number
  original: boolean
  popularity: number
}

export interface Session {
  id: string
  subscriber: Subscriber
  title: Title
  start: string
  minutes: number | null
  device: string
  completed: boolean
}

function makeSubscribers(rng: Rng): Subscriber[] {
  const first = toDay('2022-01-01')
  const last = toDay(LAST_DAY)
  const subs: Subscriber[] = []
  for (let i = 1; i <= 3000; i++) {
    const country = weighted(rng, COUNTRIES.map((x) => [x, x.weight] as const))
    const city = pick(rng, country.cities)
    // sqrt skews signups towards later dates: the service is growing.
    const signup = first + Math.floor(Math.sqrt(rng()) * (last - first + 1))
    const sub: Subscriber = {
      id: `SUB-${pad(i, 5)}`,
      signup,
      plan: weighted(rng, PLANS.map((p) => [p.code, p.weight] as const)),
      country,
      city,
      cityLabel: city.alt && rng() < 0.15 ? city.alt : city.city,
      postal: city.zip ? pad(Number(city.zip) + randInt(rng, 0, 8), 5) : '',
      lat: round(city.lat + (rng() - 0.5) * 0.16, 4),
      lon: round(city.lon + (rng() - 0.5) * 0.16, 4),
      ageBand: weighted(rng, AGE_BANDS),
      channel: weighted(rng, CHANNELS),
    }
    if (rng() < 0.14 && last - signup > 30) {
      sub.cancel = signup + randInt(rng, 20, last - signup)
      sub.reason = weighted(rng, REASONS)
    }
    subs.push(sub)
  }
  return subs
}

function makeTitles(rng: Rng): Title[] {
  const used = new Set<string>()
  const name = (): string => {
    for (;;) {
      const n = weighted(rng, [
        [`The ${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`, 4],
        [`${pick(rng, NOUNS)} of ${pick(rng, PLACES)}`, 2],
        [`${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}s`, 2],
        [`${pick(rng, PLACES)}`, 0.4],
      ] as const)
      if (!used.has(n)) {
        used.add(n)
        return n
      }
    }
  }
  const genres = Object.keys(GENRES)
  return Array.from({ length: 400 }, (_, i): Title => {
    const genre = pick(rng, genres)
    const type = genre === 'Documentary' || rng() < 0.45 ? (rng() < 0.5 ? 'Series' : 'Movie') : rng() < 0.4 ? 'Series' : 'Movie'
    const kids = genre === 'Kids & Family'
    return {
      id: `T-${pad(i + 1, 4)}`,
      title: name(),
      type,
      genre,
      subGenre: pick(rng, GENRES[genre]!),
      releaseYear: 2025 - Math.floor(rng() ** 2 * 31),
      rating: kids ? weighted(rng, [['TV-Y', 1], ['TV-G', 1]]) : weighted(rng, [['TV-PG', 2], ['TV-14', 4], ['TV-MA', 3]]),
      runtime: type === 'Movie' ? randInt(rng, 78, 165) : kids ? randInt(rng, 11, 24) : randInt(rng, 22, 62),
      original: rng() < 0.3,
      // Zipf-like: a few hits, a long tail.
      popularity: 1 / (1 + i * rng()),
    }
  })
}

function makeSessions(rng: Rng, subs: Subscriber[], titles: Title[], year: number, count: number): Session[] {
  const firstDay = toDay(`${year}-01-01`)
  const days = Array.from({ length: toDay(`${year}-12-31`) - firstDay + 1 }, (_, i) => firstDay + i)
  const activeOn = (s: Subscriber, day: number) => s.signup <= day && (s.cancel === undefined || s.cancel > day)
  const dayWeights = days.map((day) => {
    const d = new Date(day * DAY_MS)
    const active = subs.reduce((n, s) => n + (activeOn(s, day) ? 1 : 0), 0)
    return [day, MONTH_FACTOR[d.getUTCMonth()]! * WEEKDAY_FACTOR[d.getUTCDay()]! * active] as const
  })
  const catalog = titles.filter((t) => t.releaseYear <= year).map((t) => [t, t.popularity] as const)
  const hours = HOUR_WEIGHTS.map((w, h) => [h, w] as const)
  const sessions: Session[] = []
  for (let i = 1; i <= count; i++) {
    const day = weighted(rng, dayWeights)
    let subscriber: Subscriber
    do subscriber = pick(rng, subs)
    while (!activeOn(subscriber, day))
    const title = weighted(rng, catalog)
    const episodes = title.type === 'Series' ? randInt(rng, 1, 4) : 1
    const lastShare = rng() < 0.55 ? 1 : 0.1 + rng() * 0.85
    const minutes = Math.max(1, Math.round(title.runtime * (episodes - 1 + lastShare)))
    const time = `${pad(weighted(rng, hours), 2)}:${pad(randInt(rng, 0, 59), 2)}:${pad(randInt(rng, 0, 59), 2)}`
    sessions.push({
      id: '',
      subscriber,
      title,
      start: `${isoOf(day)} ${time}`,
      // A few gaps for ZN/IFNULL practice.
      minutes: rng() < 0.004 ? null : minutes,
      device: rng() < 0.01 ? '' : weighted(rng, DEVICES),
      completed: lastShare === 1,
    })
  }
  sessions.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  // Number in time order, so Session ID sorts like Start.
  sessions.forEach((s, i) => (s.id = `${String(year).slice(2)}-${pad(i + 1, 6)}`))
  return sessions
}

const csvCell = (v: string | number | boolean | null) => {
  const s = v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (header: string[], rows: (string | number | boolean | null)[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

export interface Dataset {
  subscribers: Subscriber[]
  titles: Title[]
  sessions: Session[]
  /** Path under public/data/ → file contents. */
  files: Record<string, string | Uint8Array>
}

export function generate(seed: number = SEED): Dataset {
  const rng = seededRng(seed)
  const subscribers = makeSubscribers(rng)
  const titles = makeTitles(rng)
  const s2024 = makeSessions(rng, subscribers, titles, 2024, 15000)
  const s2025 = makeSessions(rng, subscribers, titles, 2025, 17000)

  const sessionCsv = (rows: Session[]) =>
    toCsv(
      ['Session ID', 'Subscriber ID', 'Title ID', 'Start', 'Minutes Watched', 'Device', 'Completed'],
      rows.map((s) => [s.id, s.subscriber.id, s.title.id, s.start, s.minutes, s.device, s.completed]),
    )

  // Targets: per region and month, set near the actual figures.
  const months = Array.from({ length: 24 }, (_, i) => `${2024 + Math.floor(i / 12)}-${pad((i % 12) + 1, 2)}`)
  const actual = new Map<string, { signups: number; minutes: number }>()
  const bump = (region: string, month: string, key: 'signups' | 'minutes', by: number) => {
    const k = `${region}|${month}`
    const a = actual.get(k) ?? { signups: 0, minutes: 0 }
    a[key] += by
    actual.set(k, a)
  }
  for (const s of subscribers) bump(s.country.region, isoOf(s.signup).slice(0, 7), 'signups', 1)
  for (const s of [...s2024, ...s2025]) bump(s.subscriber.country.region, s.start.slice(0, 7), 'minutes', s.minutes ?? 0)
  const targetRows: Cell[][] = [['Region', 'Month', 'Target New Subscribers', 'Target Hours']]
  for (const { region } of REGIONS) {
    for (const month of months) {
      const a = actual.get(`${region}|${month}`) ?? { signups: 0, minutes: 0 }
      targetRows.push([
        region,
        { date: `${month}-01` },
        Math.max(1, Math.round(a.signups * (0.9 + rng() * 0.25))),
        Math.round((a.minutes / 60) * (0.9 + rng() * 0.25)),
      ])
    }
  }

  const files: Record<string, string | Uint8Array> = {
    'subscribers.csv': toCsv(
      ['Subscriber ID', 'Signup Date', 'Plan Code', 'Country', 'State/Province', 'City', 'Postal Code', 'Latitude', 'Longitude', 'Age Band', 'Channel'],
      subscribers.map((s) => [s.id, isoOf(s.signup), s.plan, s.country.country, s.city.state, s.cityLabel, s.postal, s.lat, s.lon, s.ageBand, s.channel]),
    ),
    'plans.csv': toCsv(
      ['Plan Code', 'Plan', 'Monthly Price', 'Screens', 'Ad Supported'],
      PLANS.map((p) => [p.code, p.plan, p.price, p.screens, p.ads]),
    ),
    'titles.csv': toCsv(
      ['Title ID', 'Title', 'Type', 'Genre', 'Sub-Genre', 'Release Year', 'Rating', 'Runtime', 'Original'],
      titles.map((t) => [t.id, t.title, t.type, t.genre, t.subGenre, t.releaseYear, t.rating, t.runtime, t.original]),
    ),
    'sessions_2024.csv': sessionCsv(s2024),
    'sessions_2025.csv': sessionCsv(s2025),
    'cancellations.csv': toCsv(
      ['Subscriber ID', 'Cancel Date', 'Reason'],
      subscribers.filter((s) => s.cancel !== undefined).map((s) => [s.id, isoOf(s.cancel!), s.reason!]),
    ),
    'regions.csv': toCsv(
      ['Country', 'Region', 'Regional Manager'],
      COUNTRIES.map((x) => [x.country, x.region, REGIONS.find((r) => r.region === x.region)!.manager]),
    ),
    'targets.xlsx': writeXlsx('Targets', targetRows),
  }
  return { subscribers, titles, sessions: [...s2024, ...s2025], files }
}
