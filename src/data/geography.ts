// Real places used by the Driftlight dataset: regions, countries and cities
// with coordinates. Shared by the generator and the engine (generated
// latitude/longitude, filled maps).

export interface City {
  city: string
  state: string
  lat: number
  lon: number
  /** US only: the base ZIP code, kept as text so leading zeros survive in the CSV. */
  zip?: string
  /** Variant spelling some rows use, for grouping practice. */
  alt?: string
}

export interface Country {
  country: string
  region: string
  /** ISO 3166-1 numeric code, the id of the country's shape in world-atlas. */
  iso: string
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
    country: 'United States', region: 'North America', iso: '840', weight: 25,
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
    country: 'Canada', region: 'North America', iso: '124', weight: 5,
    cities: [
      c('Toronto', 'Ontario', 43.6532, -79.3832),
      c('Vancouver', 'British Columbia', 49.2827, -123.1207),
      c('Montreal', 'Quebec', 45.5017, -73.5673),
      c('Calgary', 'Alberta', 51.0447, -114.0719),
    ],
  },
  {
    country: 'Mexico', region: 'North America', iso: '484', weight: 4,
    cities: [
      c('Mexico City', 'Ciudad de México', 19.4326, -99.1332),
      c('Guadalajara', 'Jalisco', 20.6597, -103.3496),
      c('Monterrey', 'Nuevo León', 25.6866, -100.3161),
    ],
  },
  {
    country: 'Brazil', region: 'Latin America', iso: '076', weight: 6,
    cities: [
      c('São Paulo', 'São Paulo', -23.5505, -46.6333, { alt: 'Sao Paulo' }),
      c('Rio de Janeiro', 'Rio de Janeiro', -22.9068, -43.1729),
      c('Belo Horizonte', 'Minas Gerais', -19.9167, -43.9345),
    ],
  },
  {
    country: 'Argentina', region: 'Latin America', iso: '032', weight: 2,
    cities: [c('Buenos Aires', 'Buenos Aires', -34.6037, -58.3816), c('Córdoba', 'Córdoba', -31.4201, -64.1888)],
  },
  {
    country: 'Colombia', region: 'Latin America', iso: '170', weight: 2,
    cities: [c('Bogotá', 'Bogotá', 4.711, -74.0721, { alt: 'Bogota' }), c('Medellín', 'Antioquia', 6.2442, -75.5812)],
  },
  { country: 'Chile', region: 'Latin America', iso: '152', weight: 1, cities: [c('Santiago', 'Santiago Metropolitan', -33.4489, -70.6693)] },
  {
    country: 'United Kingdom', region: 'Europe', iso: '826', weight: 8,
    cities: [c('London', 'England', 51.5074, -0.1278), c('Manchester', 'England', 53.4808, -2.2426), c('Edinburgh', 'Scotland', 55.9533, -3.1883)],
  },
  {
    country: 'Germany', region: 'Europe', iso: '276', weight: 7,
    cities: [
      c('Berlin', 'Berlin', 52.52, 13.405),
      c('Munich', 'Bavaria', 48.1351, 11.582, { alt: 'München' }),
      c('Hamburg', 'Hamburg', 53.5511, 9.9937),
      c('Cologne', 'North Rhine-Westphalia', 50.9375, 6.9603, { alt: 'Köln' }),
    ],
  },
  {
    country: 'France', region: 'Europe', iso: '250', weight: 4,
    cities: [
      c('Paris', 'Île-de-France', 48.8566, 2.3522),
      c('Lyon', 'Auvergne-Rhône-Alpes', 45.764, 4.8357),
      c('Marseille', "Provence-Alpes-Côte d'Azur", 43.2965, 5.3698),
    ],
  },
  { country: 'Spain', region: 'Europe', iso: '724', weight: 3, cities: [c('Madrid', 'Community of Madrid', 40.4168, -3.7038), c('Barcelona', 'Catalonia', 41.3874, 2.1686)] },
  { country: 'Italy', region: 'Europe', iso: '380', weight: 3, cities: [c('Rome', 'Lazio', 41.9028, 12.4964), c('Milan', 'Lombardy', 45.4642, 9.19)] },
  { country: 'Netherlands', region: 'Europe', iso: '528', weight: 2, cities: [c('Amsterdam', 'North Holland', 52.3676, 4.9041), c('Rotterdam', 'South Holland', 51.9244, 4.4777)] },
  { country: 'Sweden', region: 'Europe', iso: '752', weight: 1.5, cities: [c('Stockholm', 'Stockholm County', 59.3293, 18.0686)] },
  { country: 'Poland', region: 'Europe', iso: '616', weight: 2, cities: [c('Warsaw', 'Masovian', 52.2297, 21.0122), c('Kraków', 'Lesser Poland', 50.0647, 19.945)] },
  { country: 'Japan', region: 'Asia Pacific', iso: '392', weight: 4, cities: [c('Tokyo', 'Tokyo', 35.6762, 139.6503), c('Osaka', 'Osaka', 34.6937, 135.5023)] },
  {
    country: 'Australia', region: 'Asia Pacific', iso: '036', weight: 4,
    cities: [
      c('Sydney', 'New South Wales', -33.8688, 151.2093),
      c('Melbourne', 'Victoria', -37.8136, 144.9631),
      c('Brisbane', 'Queensland', -27.4698, 153.0251),
    ],
  },
  {
    country: 'India', region: 'Asia Pacific', iso: '356', weight: 6,
    cities: [c('Mumbai', 'Maharashtra', 19.076, 72.8777), c('Bengaluru', 'Karnataka', 12.9716, 77.5946), c('Delhi', 'Delhi', 28.7041, 77.1025)],
  },
  { country: 'South Korea', region: 'Asia Pacific', iso: '410', weight: 2, cities: [c('Seoul', 'Seoul', 37.5665, 126.978)] },
  { country: 'Singapore', region: 'Asia Pacific', iso: '702', weight: 1, cities: [c('Singapore', '', 1.3521, 103.8198)] },
  { country: 'New Zealand', region: 'Asia Pacific', iso: '554', weight: 1, cities: [c('Auckland', 'Auckland', -36.8485, 174.7633)] },
  {
    country: 'South Africa', region: 'Middle East & Africa', iso: '710', weight: 2,
    cities: [c('Johannesburg', 'Gauteng', -26.2041, 28.0473), c('Cape Town', 'Western Cape', -33.9249, 18.4241)],
  },
  { country: 'United Arab Emirates', region: 'Middle East & Africa', iso: '784', weight: 1.5, cities: [c('Dubai', 'Dubai', 25.2048, 55.2708)] },
  { country: 'Nigeria', region: 'Middle East & Africa', iso: '566', weight: 1.5, cities: [c('Lagos', 'Lagos', 6.5244, 3.3792)] },
  { country: 'Egypt', region: 'Middle East & Africa', iso: '818', weight: 1, cities: [c('Cairo', 'Cairo', 30.0444, 31.2357)] },
]
