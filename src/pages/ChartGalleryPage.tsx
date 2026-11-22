// Unlisted developer page (/dev/charts): every basic chart type from the
// outline, drawn by the engine with its shelves. Used to check the renderer in
// a real browser; lessons will embed the same specs.
import { Shelves } from '../engine/Shelves'
import { Viz } from '../engine/Viz'
import { vizSpecSchema } from '../engine/spec'

const month = { field: 'Start', date: { level: 'month', mode: 'value' } }
const generatedMap = { columns: [{ field: 'Longitude (generated)' }], rows: [{ field: 'Latitude (generated)' }] }

const CHARTS: [string, unknown][] = [
  ['2.1.1 Bar chart', { rows: [{ field: 'Genre', sort: { order: 'desc', field: 'Minutes Watched', agg: 'sum' } }], columns: [{ field: 'Minutes Watched' }], marks: { label: { field: 'Minutes Watched' } } }],
  ['2.1.2 Line chart', { columns: [month], rows: [{ field: 'Minutes Watched' }], marks: { color: { field: 'Type' } } }],
  ['2.1.3 Scatterplot', { source: 'titles', columns: [{ field: 'Runtime', agg: 'avg' }], rows: [{ field: 'Titles (Count)' }], marks: { detail: [{ field: 'Sub-Genre' }], color: { field: 'Genre' } } }],
  ['2.1.4 Symbol map', { source: 'subscribers', ...generatedMap, marks: { detail: [{ field: 'City' }], size: { field: 'Subscribers (Count)' } } }],
  ['2.1.4 Filled map', { source: 'subscribers', ...generatedMap, marks: { type: 'map', detail: [{ field: 'Country' }], color: { field: 'Subscribers (Count)' } } }],
  ['2.1.7 Stacked bar', { columns: [{ field: 'Region' }], rows: [{ field: 'Minutes Watched' }], marks: { color: { field: 'Device' } } }],
  ['2.1.8 Density map', { source: 'subscribers', columns: [{ field: 'Longitude' }], rows: [{ field: 'Latitude' }], marks: { type: 'density', detail: [{ field: 'Subscriber ID' }] } }],
  ['2.1.9 Crosstab', { columns: [{ field: 'Start', date: { level: 'year', mode: 'part' } }], rows: [{ field: 'Region' }], marks: { label: { field: 'Minutes Watched' } } }],
  ['2.1.9 Highlight table', { columns: [{ field: 'Start', date: { level: 'weekday', mode: 'part' } }], rows: [{ field: 'Device' }], marks: { type: 'square', color: { field: 'Sessions (Count)' }, label: { field: 'Sessions (Count)' } } }],
  ['4.2.3 Date parts make headers', { columns: [{ field: 'Start', date: { level: 'year', mode: 'part' } }, { field: 'Start', date: { level: 'quarter', mode: 'part' } }], rows: [{ field: 'Minutes Watched' }] }],
]

export default function ChartGalleryPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Chart gallery</h1>
      {CHARTS.map(([title, s]) => {
        const spec = vizSpecSchema.parse(s)
        return (
          <section key={title} className="space-y-2">
            <h2 className="text-lg font-medium">{title}</h2>
            <Shelves spec={spec} />
            <Viz spec={spec} title={title} />
          </section>
        )
      })}
    </div>
  )
}
