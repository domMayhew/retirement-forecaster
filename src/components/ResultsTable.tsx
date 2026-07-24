import { useState } from 'react'
import type { Forecast } from '../engine/types'
import { formatCurrency } from '../utils/format'

interface Props {
  forecast: Forecast
}

type ColumnGroup = 'rrsp' | 'tfsa' | 'totalPct' | 'cpp' | 'oas' | 'incomeMix'

const COLUMN_GROUPS: { key: ColumnGroup; label: string }[] = [
  { key: 'rrsp', label: 'RRSP' },
  { key: 'tfsa', label: 'TFSA' },
  { key: 'totalPct', label: 'Total % withdrawn' },
  { key: 'cpp', label: 'CPP' },
  { key: 'oas', label: 'OAS' },
  { key: 'incomeMix', label: 'Income mix' },
]

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Currency, or an em dash for zero so the income columns stay readable. */
function money(value: number): string {
  return value === 0 ? '—' : formatCurrency(value)
}

/** Percent, or an em dash when nothing happened this row (so 0% isn't confused with N/A). */
function pctOrDash(value: number, applicable: boolean): string {
  return applicable ? pct(value) : '—'
}

export function ResultsTable({ forecast }: Props) {
  const [hidden, setHidden] = useState<Set<ColumnGroup>>(new Set())

  function toggleGroup(key: ColumnGroup) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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

  const show = (key: ColumnGroup) => !hidden.has(key)

  return (
    <section className="card">
      <h2>Projection</h2>
      <div className="column-toggles" role="group" aria-label="Show/hide table columns">
        <span className="column-toggles-label">Show:</span>
        {COLUMN_GROUPS.map((group) => (
          <button
            key={group.key}
            type="button"
            className={show(group.key) ? 'col-toggle active' : 'col-toggle'}
            aria-pressed={show(group.key)}
            onClick={() => toggleGroup(group.key)}
          >
            {group.label}
          </button>
        ))}
      </div>
      <p className="table-legend">
        <span className="swatch swatch-below" /> The RRIF minimum (from age
        72 on) forced a bigger RRSP withdrawal than the plan otherwise
        needed this year.
        <span className="swatch swatch-shortfall" /> Shortfall — savings could
        not fully cover the required income.
      </p>
      <div className="table-scroll results-scroll">
        <table className="results">
          <thead>
            <tr>
              <th rowSpan={2}>Age</th>
              <th rowSpan={2}>Phase</th>
              <th className="num" colSpan={show('rrsp') && show('tfsa') ? 3 : show('rrsp') || show('tfsa') ? 2 : 1}>
                Balances (end of year)
              </th>
              {show('rrsp') && (
                <th className="num" colSpan={3}>RRSP withdrawal</th>
              )}
              {show('tfsa') && (
                <th className="num" colSpan={2}>TFSA withdrawal</th>
              )}
              {show('totalPct') && (
                <th className="num" rowSpan={2}>Total&nbsp;%<br />withdrawn</th>
              )}
              {show('cpp') && <th className="num" colSpan={2}>CPP</th>}
              {show('oas') && <th className="num" colSpan={2}>OAS</th>}
              {show('incomeMix') && <th className="num" colSpan={2}>Income mix</th>}
            </tr>
            <tr>
              {show('rrsp') && <th className="num sub">RRSP</th>}
              {show('tfsa') && <th className="num sub">TFSA</th>}
              <th className="num sub">Total</th>
              {show('rrsp') && (
                <>
                  <th className="num sub">Gross</th>
                  <th className="num sub">After tax</th>
                  <th className="num sub">% of RRSP</th>
                </>
              )}
              {show('tfsa') && (
                <>
                  <th className="num sub">Amount</th>
                  <th className="num sub">% of TFSA</th>
                </>
              )}
              {show('cpp') && (
                <>
                  <th className="num sub">Gross</th>
                  <th className="num sub">After tax</th>
                </>
              )}
              {show('oas') && (
                <>
                  <th className="num sub">Gross</th>
                  <th className="num sub">After tax</th>
                </>
              )}
              {show('incomeMix') && (
                <>
                  <th className="num sub">From savings</th>
                  <th className="num sub">From CPP/OAS</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {forecast.map((row) => {
              const forced = row.forcedMinimumWithdrawal
              const classes = [
                row.shortfall ? 'row-shortfall' : '',
                forced ? 'row-below-min' : '',
              ]
                .filter(Boolean)
                .join(' ')
              const rrspNet = row.rrspWithdrawal - row.taxPaid
              const hasIncome = row.netFromSavings > 0 || row.cppAfterTax > 0 || row.oasAfterTax > 0
              return (
                <tr key={row.age} className={classes || undefined}>
                  <td>{row.age}</td>
                  <td>
                    <span className={`phase phase-${row.phase}`}>
                      {row.phase === 'accumulation' ? 'Saving' : 'Retired'}
                      {row.shortfall ? ' · shortfall' : ''}
                    </span>
                  </td>
                  {show('rrsp') && <td className="num">{formatCurrency(row.rrsp)}</td>}
                  {show('tfsa') && <td className="num">{formatCurrency(row.tfsa)}</td>}
                  <td className="num total">{formatCurrency(row.total)}</td>
                  {show('rrsp') && (
                    <>
                      <td className="num">{money(row.rrspWithdrawal)}</td>
                      <td className="num">{money(rrspNet)}</td>
                      <td className={`num${forced ? ' cell-below-min' : ''}`}>
                        {pctOrDash(row.rrspWithdrawalPct, row.rrspWithdrawal > 0)}
                      </td>
                    </>
                  )}
                  {show('tfsa') && (
                    <>
                      <td className="num">{money(row.tfsaWithdrawal)}</td>
                      <td className="num">{pctOrDash(row.tfsaWithdrawalPct, row.tfsaWithdrawal > 0)}</td>
                    </>
                  )}
                  {show('totalPct') && (
                    <td className="num">
                      {pctOrDash(row.withdrawalPct, row.rrspWithdrawal > 0 || row.tfsaWithdrawal > 0)}
                    </td>
                  )}
                  {show('cpp') && (
                    <>
                      <td className="num">{money(row.cpp)}</td>
                      <td className="num">{money(row.cppAfterTax)}</td>
                    </>
                  )}
                  {show('oas') && (
                    <>
                      <td className="num">{money(row.oas)}</td>
                      <td className="num">{money(row.oasAfterTax)}</td>
                    </>
                  )}
                  {show('incomeMix') && (
                    <>
                      <td className="num">{pctOrDash(row.incomeFromSavingsPct, hasIncome)}</td>
                      <td className="num">{pctOrDash(row.incomeFromCppOasPct, hasIncome)}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
