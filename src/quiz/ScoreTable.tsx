import { percent, type ScoreRow } from './results'

/** Correct count and percentage per row (domain or task). */
export function ScoreTable({ rows, heading }: { rows: readonly ScoreRow[]; heading: string }) {
  return (
    <table className="w-full max-w-2xl text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          <th className="py-1 font-medium">{heading}</th>
          <th className="py-1 text-right font-medium">Correct</th>
          <th className="py-1 text-right font-medium">%</th>
        </tr>
      </thead>
      <tbody>
        {rows
          .filter((r) => r.total > 0)
          .map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-1 pr-2">
                {/* Domains are numbered "2.", tasks "2.1". */}
                {r.id.includes('.') ? r.id : `${r.id}.`} {r.label}
              </td>
              <td className="py-1 text-right font-mono">
                {r.correct}/{r.total}
              </td>
              <td className="py-1 text-right font-mono">{percent(r.correct, r.total)}%</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
