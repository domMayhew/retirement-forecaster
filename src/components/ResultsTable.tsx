import type { Forecast } from '../engine/types'
import { formatCurrency } from '../utils/format'

interface Props {
  forecast: Forecast
}

export function ResultsTable({ forecast }: Props) {
  if (forecast.length === 0) {
    return (
      <section className="card">
        <h2>Projection</h2>
        <p className="empty">
          No results yet. Adjust the inputs above — results appear once the
          forecast engine returns data.
        </p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Projection</h2>
      <div className="table-scroll">
        <table className="results">
          <thead>
            <tr>
              <th>Age</th>
              <th>Phase</th>
              <th className="num">RRSP balance</th>
              <th className="num">TFSA balance</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((row) => (
              <tr key={row.age} className={row.shortfall ? 'row-shortfall' : undefined}>
                <td>{row.age}</td>
                <td>
                  <span className={`phase phase-${row.phase}`}>
                    {row.phase === 'accumulation' ? 'Saving' : 'Retired'}
                    {row.shortfall ? ' · shortfall' : ''}
                  </span>
                </td>
                <td className="num">{formatCurrency(row.rrsp)}</td>
                <td className="num">{formatCurrency(row.tfsa)}</td>
                <td className="num total">{formatCurrency(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
