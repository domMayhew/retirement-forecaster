import type { Forecast, ForecastYear } from '../engine/types'
import { formatCurrency } from '../utils/format'

interface Props {
  forecast: Forecast
}

// The eventual (currently deferred) mandatory RRSP minimum forces at least 5%
// of the RRSP to be withdrawn each year — but only from age 72 on. Retirement
// years from 72 whose withdrawal falls below that threshold are where the rule
// would force additional withdrawals, so we flag them.
const MANDATORY_MIN_PCT = 0.05
const MANDATORY_MIN_AGE = 72

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Currency, or an em dash for zero so the income columns stay readable. */
function money(value: number): string {
  return value === 0 ? '—' : formatCurrency(value)
}

function belowMandatory(row: ForecastYear): boolean {
  return (
    row.phase === 'retirement' &&
    row.age >= MANDATORY_MIN_AGE &&
    row.withdrawalPct < MANDATORY_MIN_PCT
  )
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
      <p className="table-legend">
        <span className="swatch swatch-below" /> Age 72+ withdrawal below the 5%
        RRSP minimum — the (deferred) mandatory rule would force a larger
        withdrawal in these years.
        <span className="swatch swatch-shortfall" /> Shortfall — savings could
        not fully cover the required income.
      </p>
      <div className="table-scroll">
        <table className="results">
          <thead>
            <tr>
              <th rowSpan={2}>Age</th>
              <th rowSpan={2}>Phase</th>
              <th className="num" colSpan={3}>Balances (end of year)</th>
              <th className="num" rowSpan={2}>Withdraw&nbsp;%</th>
              <th className="num" colSpan={2}>RRSP withdrawal</th>
              <th className="num" rowSpan={2}>TFSA withdrawal</th>
              <th className="num" colSpan={2}>CPP</th>
              <th className="num" colSpan={2}>OAS</th>
            </tr>
            <tr>
              <th className="num sub">RRSP</th>
              <th className="num sub">TFSA</th>
              <th className="num sub">Total</th>
              <th className="num sub">Gross</th>
              <th className="num sub">After tax</th>
              <th className="num sub">Gross</th>
              <th className="num sub">After tax</th>
              <th className="num sub">Gross</th>
              <th className="num sub">After tax</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((row) => {
              const below = belowMandatory(row)
              const classes = [
                row.shortfall ? 'row-shortfall' : '',
                below ? 'row-below-min' : '',
              ]
                .filter(Boolean)
                .join(' ')
              const rrspNet = row.rrspWithdrawal - row.taxPaid
              return (
                <tr key={row.age} className={classes || undefined}>
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
                  <td className={`num${below ? ' cell-below-min' : ''}`}>
                    {row.phase === 'retirement' &&
                    (row.rrspWithdrawal > 0 || row.tfsaWithdrawal > 0)
                      ? pct(row.withdrawalPct)
                      : '—'}
                  </td>
                  <td className="num">{money(row.rrspWithdrawal)}</td>
                  <td className="num">{money(rrspNet)}</td>
                  <td className="num">{money(row.tfsaWithdrawal)}</td>
                  <td className="num">{money(row.cpp)}</td>
                  <td className="num">{money(row.cppAfterTax)}</td>
                  <td className="num">{money(row.oas)}</td>
                  <td className="num">{money(row.oasAfterTax)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
