import { useState } from 'react'
import type { ContributionOverride, Forecast, WithdrawalOverride } from '../engine/types'
import { formatCurrency } from '../utils/format'
import { BareNumberInput } from './fields'

interface Props {
  forecast: Forecast
  contributionOverrides: Record<number, ContributionOverride>
  onContributionOverride: (age: number, field: keyof ContributionOverride, value: number) => void
  withdrawalOverrides: Record<number, WithdrawalOverride>
  onWithdrawalOverride: (age: number, field: keyof WithdrawalOverride, value: number) => void
  onRecalculate: () => void
}

type ColumnGroup =
  | 'returnRate'
  | 'contributions'
  | 'rrsp'
  | 'tfsa'
  | 'totalPct'
  | 'cpp'
  | 'oas'
  | 'incomeMix'

const COLUMN_GROUPS: { key: ColumnGroup; label: string }[] = [
  { key: 'returnRate', label: 'Applied return' },
  { key: 'contributions', label: 'Contributions' },
  { key: 'rrsp', label: 'RRSP' },
  { key: 'tfsa', label: 'TFSA' },
  { key: 'totalPct', label: 'Total % withdrawn' },
  { key: 'cpp', label: 'CPP' },
  { key: 'oas', label: 'OAS' },
  { key: 'incomeMix', label: 'Income mix' },
]

// A withdrawal rate above this is often considered a less sustainable pace
// (the "4% rule" rule-of-thumb for how long savings can be expected to last).
const HIGH_WITHDRAWAL_PCT = 0.04

const OVERRIDDEN_TITLE = 'Manually edited — no longer matches what the Plan inputs would produce.'

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

export function ResultsTable({
  forecast,
  contributionOverrides,
  onContributionOverride,
  withdrawalOverrides,
  onWithdrawalOverride,
  onRecalculate,
}: Props) {
  // Contributions and the per-year applied return are usually only
  // interesting in specific moments (editing, checking variability); hide
  // them by default to keep the table's first impression cleaner.
  const [hidden, setHidden] = useState<Set<ColumnGroup>>(new Set(['contributions', 'returnRate']))
  const [showSavingYears, setShowSavingYears] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

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
  const overrideCount =
    Object.keys(contributionOverrides).length + Object.keys(withdrawalOverrides).length

  const hasRetirementYears = forecast.some((r) => r.phase === 'retirement')
  // Default to retirement years only — the accumulation years can be dozens
  // of largely uneventful rows — but fall back to everything if there's no
  // retirement data to narrow down to, or the saver asks to see them too.
  const visibleRows =
    showSavingYears || !hasRetirementYears
      ? forecast
      : forecast.filter((r) => r.phase === 'retirement')

  return (
    <section className="card">
      <div className="section-title-row">
        <h2>Projection</h2>
        <div className="section-title-actions">
          {hasRetirementYears && (
            <label className="section-toggle">
              <input
                type="checkbox"
                checked={showSavingYears}
                onChange={(e) => setShowSavingYears(e.target.checked)}
              />
              Show saving years too
            </label>
          )}
          <button
            type="button"
            className={isEditing ? 'btn-edit-toggle active' : 'btn-edit-toggle'}
            aria-pressed={isEditing}
            onClick={() => setIsEditing((v) => !v)}
          >
            {isEditing ? 'Done editing' : 'Edit values'}
          </button>
        </div>
      </div>
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
      {overrideCount > 0 && (
        <div className="active-plan-banner">
          <span>
            {overrideCount} manually edited {overrideCount === 1 ? 'value' : 'values'} — this
            table no longer matches the Plan inputs exactly.
          </span>
          <button type="button" className="btn-back" onClick={onRecalculate}>
            Recalculate from inputs
          </button>
        </div>
      )}
      <div className="table-scroll results-scroll">
        <table className="results">
          <thead>
            <tr>
              <th rowSpan={2}>Age</th>
              <th rowSpan={2}>Phase</th>
              {show('returnRate') && <th className="num" colSpan={2}>Return</th>}
              {show('contributions') && (
                <th className="num" colSpan={2}>Contributions</th>
              )}
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
              {show('returnRate') && (
                <>
                  <th
                    className="num sub"
                    title="The rate of return actually applied to grow this year's balance — flat unless variability is in play, in which case it's this year's sampled value."
                  >
                    This year
                  </th>
                  <th
                    className="num sub"
                    title="The simple average of every applied return from the first projected year through this one. Not guaranteed to equal the assumed rate of return — a finite sampled sequence only converges toward it over a long enough run."
                  >
                    Average to date
                  </th>
                </>
              )}
              {show('contributions') && (
                <>
                  <th className="num sub">RRSP</th>
                  <th className="num sub">TFSA</th>
                </>
              )}
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
            {visibleRows.map((row) => {
              const forced = row.forcedMinimumWithdrawal
              const classes = row.shortfall ? 'row-shortfall' : undefined
              const rrspNet = row.rrspWithdrawal - row.taxPaid
              const hasIncome = row.netFromSavings > 0 || row.cppAfterTax > 0 || row.oasAfterTax > 0
              const contributionOverride = contributionOverrides[row.age]
              const withdrawalOverride = withdrawalOverrides[row.age]
              const canEditContribution = row.phase === 'accumulation'
              const canEditWithdrawal = row.phase === 'retirement'
              return (
                <tr key={row.age} className={classes}>
                  <td>{row.age}</td>
                  <td>
                    <span
                      className={`phase phase-${row.phase}`}
                      title={
                        row.shortfall
                          ? "Shortfall: savings couldn't fully cover the required income this year."
                          : undefined
                      }
                    >
                      {row.phase === 'accumulation' ? 'Saving' : 'Retired'}
                      {row.shortfall ? ' · shortfall' : ''}
                    </span>
                  </td>
                  {show('returnRate') && (
                    <>
                      <td className="num">{pct(row.appliedRateOfReturn)}</td>
                      <td className="num">{pct(row.averageReturnToDate)}</td>
                    </>
                  )}
                  {show('contributions') &&
                    (!canEditContribution ? (
                      <>
                        <td className="num">—</td>
                        <td className="num">—</td>
                      </>
                    ) : isEditing ? (
                      <>
                        <td
                          className={`num${contributionOverride?.rrspContribution !== undefined ? ' cell-overridden' : ''}`}
                          title={contributionOverride?.rrspContribution !== undefined ? OVERRIDDEN_TITLE : undefined}
                        >
                          <div className="cell-affix">
                            <span className="affix">$</span>
                            <BareNumberInput
                              label=""
                              min={0}
                              step={50}
                              value={row.rrspContribution}
                              ariaLabel={`Age ${row.age} RRSP contribution`}
                              onChange={(v) => onContributionOverride(row.age, 'rrspContribution', v)}
                            />
                          </div>
                        </td>
                        <td
                          className={`num${contributionOverride?.tfsaContribution !== undefined ? ' cell-overridden' : ''}`}
                          title={contributionOverride?.tfsaContribution !== undefined ? OVERRIDDEN_TITLE : undefined}
                        >
                          <div className="cell-affix">
                            <span className="affix">$</span>
                            <BareNumberInput
                              label=""
                              min={0}
                              step={50}
                              value={row.tfsaContribution}
                              ariaLabel={`Age ${row.age} TFSA contribution`}
                              onChange={(v) => onContributionOverride(row.age, 'tfsaContribution', v)}
                            />
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className={`num${contributionOverride?.rrspContribution !== undefined ? ' cell-overridden' : ''}`}
                          title={contributionOverride?.rrspContribution !== undefined ? OVERRIDDEN_TITLE : undefined}
                        >
                          {money(row.rrspContribution)}
                        </td>
                        <td
                          className={`num${contributionOverride?.tfsaContribution !== undefined ? ' cell-overridden' : ''}`}
                          title={contributionOverride?.tfsaContribution !== undefined ? OVERRIDDEN_TITLE : undefined}
                        >
                          {money(row.tfsaContribution)}
                        </td>
                      </>
                    ))}
                  {show('rrsp') && <td className="num">{formatCurrency(row.rrsp)}</td>}
                  {show('tfsa') && <td className="num">{formatCurrency(row.tfsa)}</td>}
                  <td className="num total">{formatCurrency(row.total)}</td>
                  {show('rrsp') && (
                    <>
                      <td
                        className={`num${withdrawalOverride?.rrspWithdrawal !== undefined ? ' cell-overridden' : ''}`}
                        title={withdrawalOverride?.rrspWithdrawal !== undefined ? OVERRIDDEN_TITLE : undefined}
                      >
                        {canEditWithdrawal && isEditing ? (
                          <div className="cell-affix">
                            <span className="affix">$</span>
                            <BareNumberInput
                              label=""
                              min={0}
                              step={100}
                              value={row.rrspWithdrawal}
                              ariaLabel={`Age ${row.age} RRSP withdrawal`}
                              onChange={(v) => onWithdrawalOverride(row.age, 'rrspWithdrawal', v)}
                            />
                          </div>
                        ) : (
                          money(row.rrspWithdrawal)
                        )}
                      </td>
                      <td className="num">{money(rrspNet)}</td>
                      <td
                        className={`num${forced ? ' cell-below-min' : ''}`}
                        title={
                          forced
                            ? 'The RRIF minimum forced a bigger RRSP withdrawal than the plan otherwise needed this year.'
                            : undefined
                        }
                      >
                        {pctOrDash(row.rrspWithdrawalPct, row.rrspWithdrawal > 0)}
                      </td>
                    </>
                  )}
                  {show('tfsa') && (
                    <>
                      <td
                        className={`num${withdrawalOverride?.tfsaWithdrawal !== undefined ? ' cell-overridden' : ''}`}
                        title={withdrawalOverride?.tfsaWithdrawal !== undefined ? OVERRIDDEN_TITLE : undefined}
                      >
                        {canEditWithdrawal && isEditing ? (
                          <div className="cell-affix">
                            <span className="affix">$</span>
                            <BareNumberInput
                              label=""
                              min={0}
                              step={100}
                              value={row.tfsaWithdrawal}
                              ariaLabel={`Age ${row.age} TFSA withdrawal`}
                              onChange={(v) => onWithdrawalOverride(row.age, 'tfsaWithdrawal', v)}
                            />
                          </div>
                        ) : (
                          money(row.tfsaWithdrawal)
                        )}
                      </td>
                      <td className="num">{pctOrDash(row.tfsaWithdrawalPct, row.tfsaWithdrawal > 0)}</td>
                    </>
                  )}
                  {show('totalPct') && (
                    <td
                      className={`num${row.withdrawalPct > HIGH_WITHDRAWAL_PCT ? ' cell-below-min' : ''}`}
                      title={
                        row.withdrawalPct > HIGH_WITHDRAWAL_PCT
                          ? 'Withdrawing more than 4% of savings in a year is often considered a less sustainable pace.'
                          : undefined
                      }
                    >
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
