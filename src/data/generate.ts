// Generates the Driftlight dataset (PLAN.md §6a) from a fixed seed. Pure: it
// returns file contents, and scripts/generate-data.ts writes them. Places and
// coordinates are real so geographic roles work; people, titles and figures
// are invented. Changing anything here moves every number the content cites,
// so regenerate and rerun the tests.
import { type Rng, pick, randInt, seededRng, weighted } from './rng.ts'
import { type Cell, writeXlsx } from './xlsx.ts'

export const SEED = 20261123
export const FIRST_SESSION_DAY = '2024-01-01'
export const LAST_DAY = '2025-12-31'

interface City {
  city: string
  state: string
  lat: number
  lon: number
  /** US only: the base ZIP code, kept as text so leading zeros survive in the CSV. */
  zip?: string
  /** Variant spelling some rows use, for grouping practice. */
  alt?: string
}

interface Country {
  country: string
  region: string
  weight: number
  cities: City[]
}

export const REGIONS: { region: string; manager: string }[] = [
  { region: 'North America', manager: 'Dana Whitfield' },
  { region: 'Latin America', manager: 'Rafael Quintero' },
  { region: 'Europe', manager: 'Ingrid Solberg' },
  { region: 'Asia Pacific', manager: 'Mei Tanaka-Ross' },
  { region: 'Middle East & Africa', manager: 'Tobi Adeyemi' },
]

const c = (city: string, state: string, lat: number, lon: number, extra: Partial<City> = {}): City => ({ city, state, lat, lon, ...extra })

export const COUNTRIES: Country[] = [
  {
    country: 'United States', region: 'North America', weight: 25,
    cities: [
      c('New York', 'New York', 40.7128, -74.006, { zip: '10001' }),
      c('Los Angeles', 'California', 34.0522, -118.2437, { zip: '90012' }),
      c('Chicago', 'Illinois', 41.8781, -87.6298, { zip: '60601' }),
      c('Houston', 'Texas', 29.7604, -95.3698, { zip: '77002' }),
      c('Seattle', 'Washington', 47.6062, -122.3321, { zip: '98101' }),
      c('Boston', 'Massachusetts', 42.3601, -71.0589, { zip: '02108' }),
      c('Miami', 'Florida', 25.7617, -80.1918, { zip: '33130' }),
      c('Denver', 'Colorado', 39.7392, -104.9903, { zip: '80202' }),
      c('Atlanta', 'Georgia', 33.749, -84.388, { zip: '30303' }),
      c('Newark', 'New Jersey', 40.7357, -74.1724, { zip: '07102' }),
    ],
  },
  {
    country: 'Canada', region: 'North America', weight: 5,
    cities: [
      c('Toronto', 'Ontario', 43.6532, -79.3832),
      c('Vancouver', 'British Columbia', 49.2827, -123.1207),
      c('Montreal', 'Quebec', 45.5017, -73.5673),
      c('Calgary', 'Alberta', 51.0447, -114.0719),
    ],
  },
  {
    country: 'Mexico', region: 'North America', weight: 4,
    cities: [
      c('Mexico City', 'Ciudad de México', 19.4326, -99.1332),
      c('Guadalajara', 'Jalisco', 20.6597, -103.3496),
      c('Monterrey', 'Nuevo León', 25.6866, -100.3161),
    ],
  },
  {
    country: 'Brazil', region: 'Latin America', weight: 6,
    cities: [
      c('São Paulo', 'São Paulo', -23.5505, -46.6333, { alt: 'Sao Paulo' }),
      c('Rio de Janeiro', 'Rio de Janeiro', -22.9068, -43.1729),
      c('Belo Horizonte', 'Minas Gerais', -19.9167, -43.9345),
    ],
  },
  {
    country: 'Argentina', region: 'Latin America', weight: 2,
    cities: [c('Buenos Aires', 'Buenos Aires', -34.6037, -58.3816), c('Córdoba', 'Córdoba', -31.4201, -64.1888)],
  },
  {
    country: 'Colombia', region: 'Latin America', weight: 2,
    cities: [c('Bogotá', 'Bogotá', 4.711, -74.0721, { alt: 'Bogota' }), c('Medellín', 'Antioquia', 6.2442, -75.5812)],
  },
  { country: 'Chile', region: 'Latin America', weight: 1, cities: [c('Santiago', 'Santiago Metropolitan', -33.4489, -70.6693)] },
  {
    country: 'United Kingdom', region: 'Europe', weight: 8,
    cities: [c('London', 'England', 51.5074, -0.1278), c('Manchester', 'England', 53.4808, -2.2426), c('Edinburgh', 'Scotland', 55.9533, -3.1883)],
  },
  {
    country: 'Germany', region: 'Europe', weight: 7,
    cities: [
      c('Berlin', 'Berlin', 52.52, 13.405),
      c('Munich', 'Bavaria', 48.1351, 11.582, { alt: 'München' }),
      c('Hamburg', 'Hamburg', 53.5511, 9.9937),
      c('Cologne', 'North Rhine-Westphalia', 50.9375, 6.9603, { alt: 'Köln' }),
    ],
  },
  {
    country: 'France', region: 'Europe', weight: 4,
    cities: [
      c('Paris', 'Île-de-France', 48.8566, 2.3522),
      c('Lyon', 'Auvergne-Rhône-Alpes', 45.764, 4.8357),
      c('Marseille', "Provence-Alpes-Côte d'Azur", 43.2965, 5.3698),
    ],
  },
  { country: 'Spain', region: 'Europe', weight: 3, cities: [c('Madrid', 'Community of Madrid', 40.4168, -3.7038), c('Barcelona', 'Catalonia', 41.3874, 2.1686)] },
  { country: 'Italy', region: 'Europe', weight: 3, cities: [c('Rome', 'Lazio', 41.9028, 12.4964), c('Milan', 'Lombardy', 45.4642, 9.19)] },
  { country: 'Netherlands', region: 'Europe', weight: 2, cities: [c('Amsterdam', 'North Holland', 52.3676, 4.9041), c('Rotterdam', 'South Holland', 51.9244, 4.4777)] },
  { country: 'Sweden', region: 'Europe', weight: 1.5, cities: [c('Stockholm', 'Stockholm County', 59.3293, 18.0686)] },
  { country: 'Poland', region: 'Europe', weight: 2, cities: [c('Warsaw', 'Masovian', 52.2297, 21.0122), c('Kraków', 'Lesser Poland', 50.0647, 19.945)] },
  { country: 'Japan', region: 'Asia Pacific', weight: 4, cities: [c('Tokyo', 'Tokyo', 35.6762, 139.6503), c('Osaka', 'Osaka', 34.6937, 135.5023)] },
  {
    country: 'Australia', region: 'Asia Pacific', weight: 4,
    cities: [
      c('Sydney', 'New South Wales', -33.8688, 151.2093),
      c('Melbourne', 'Victoria', -37.8136, 144.9631),
      c('Brisbane', 'Queensland', -27.4698, 153.0251),
    ],
  },
  {
    country: 'India', region: 'Asia Pacific', weight: 6,
    cities: [c('Mumbai', 'Maharashtra', 19.076, 72.8777), c('Bengaluru', 'Karnataka', 12.9716, 77.5946), c('Delhi', 'Delhi', 28.7041, 77.1025)],
  },
  { country: 'South Korea', region: 'Asia Pacific', weight: 2, cities: [c('Seoul', 'Seoul', 37.5665, 126.978)] },
  { country: 'Singapore', region: 'Asia Pacific', weight: 1, cities: [c('Singapore', '', 1.3521, 103.8198)] },
  { country: 'New Zealand', region: 'Asia Pacific', weight: 1, cities: [c('Auckland', 'Auckland', -36.8485, 174.7633)] },
  {
    country: 'South Africa', region: 'Middle East & Africa', weight: 2,
    cities: [c('Johannesburg', 'Gauteng', -26.2041, 28.0473), c('Cape Town', 'Western Cape', -33.9249, 18.4241)],
  },
  { country: 'United Arab Emirates', region: 'Middle East & Africa', weight: 1.5, cities: [c('Dubai', 'Dubai', 25.2048, 55.2708)] },
  { country: 'Nigeria', region: 'Middle East & Africa', weight: 1.5, cities: [c('Lagos', 'Lagos', 6.5244, 3.3792)] },
  { country: 'Egypt', region: 'Middle East & Africa', weight: 1, cities: [c('Cairo', 'Cairo', 30.0444, 31.2357)] },
]

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
