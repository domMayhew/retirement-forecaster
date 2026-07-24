import { useMemo } from 'react'
import { runForecast } from '../engine/forecast'
import { findMinimumSurvivingRate, MIN_RATE_SEARCH_LOWER, MIN_RATE_SEARCH_UPPER } from '../engine/breakEvenRate'
import type { Forecast, ForecastInput } from '../engine/types'
import { withDefaults } from '../defaultInput'
import { validateSegments } from './SavingsPlanForm'
import { formatCurrency } from '../utils/format'
import { ageTicks } from '../utils/chart'
import type { SavedPlan } from '../utils/storage'

interface Props {
  plans: SavedPlan[]
  /** The app's current global assumed rate of return — applied uniformly to every compared plan, overriding whatever rate each plan happened to be saved with. */
  rateOfReturn: number
}

interface ComparedPlan {
  id: string
  name: string
  input: ForecastInput
  forecast: Forecast
  minRateLabel: string
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function minRateLabel(input: ForecastInput): string {
  const result = findMinimumSurvivingRate(input)
  if (result.alwaysSurvives) return `Below ${pct(MIN_RATE_SEARCH_LOWER)}`
  if (result.neverSurvives) return `Above ${pct(MIN_RATE_SEARCH_UPPER)} (not realistic)`
  return pct(result.rate)
}

export function PlanComparison({ plans, rateOfReturn }: Props) {
  const compared = useMemo<ComparedPlan[]>(() => {
    return plans.flatMap((plan) => {
      const input = { ...withDefaults(plan.input), rateOfReturn }
      if (validateSegments(input.savingsPlan).some(Boolean)) return []
      try {
        const forecast = runForecast(input)
        if (forecast.length === 0) return []
        return [{ id: plan.id, name: plan.name, input, forecast, minRateLabel: minRateLabel(input) }]
      } catch {
        return []
      }
    })
  }, [plans, rateOfReturn])

  if (compared.length === 0) {
    return (
      <section className="card">
        <h2>Compare plans</h2>
        <p className="empty">
          None of the selected plans could be compared — check that each has a valid
          savings plan.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <h2>Compare plans</h2>
        <p className="chart-subtitle">
          All plans use the current assumed rate of return, {pct(rateOfReturn)}, regardless
          of the rate each was saved with.
        </p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Plan</th>
                {compared.map((p, i) => (
                  <th key={p.id}>
                    <span className={`swatch compare-swatch-${i % 5}`} /> {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Ending age</td>
                {compared.map((p) => (
                  <td key={p.id}>{p.forecast[p.forecast.length - 1].age}</td>
                ))}
              </tr>
              <tr>
                <td>Ending total balance</td>
                {compared.map((p) => (
                  <td key={p.id}>
                    {formatCurrency(p.forecast[p.forecast.length - 1].total)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Savings last until</td>
                {compared.map((p) => {
                  const depletedRow = p.forecast.find((row) => row.shortfall)
                  const lastRow = p.forecast[p.forecast.length - 1]
                  return (
                    <td key={p.id}>
                      {depletedRow
                        ? `Age ${depletedRow.age - 1}`
                        : `Lasts to age ${lastRow.age}`}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <td>Minimum return needed</td>
                {compared.map((p) => (
                  <td key={p.id}>{p.minRateLabel}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <ComparisonChart plans={compared} />
    </>
  )
}

function ComparisonChart({ plans }: { plans: ComparedPlan[] }) {
  const width = 640
  const height = 260
  const pad = { top: 16, right: 16, bottom: 28, left: 64 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const minAge = Math.min(...plans.map((p) => p.forecast[0].age))
  const maxAge = Math.max(...plans.map((p) => p.forecast[p.forecast.length - 1].age))
  const maxTotal = Math.max(...plans.flatMap((p) => p.forecast.map((r) => r.total)), 1)

  const x = (age: number) => pad.left + ((age - minAge) / Math.max(maxAge - minAge, 1)) * innerW
  const y = (value: number) => pad.top + innerH - (value / maxTotal) * innerH

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: maxTotal * f,
    yPos: pad.top + innerH - f * innerH,
  }))
  const xTicks = ageTicks(minAge, maxAge)

  return (
    <section className="card">
      <h2>Total savings over time</h2>
      <ul className="chart-legend">
        {plans.map((p, i) => (
          <li key={p.id}>
            <span className={`swatch compare-swatch-${i % 5}`} /> {p.name} —{' '}
            <strong>{formatCurrency(p.forecast[p.forecast.length - 1].total)}</strong>
          </li>
        ))}
      </ul>
      <div className="table-scroll">
        <svg
          className="chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Line chart comparing total savings from age ${minAge} to ${maxAge} across ${plans.length} plans: ${plans
            .map((p) => `${p.name} ending at ${formatCurrency(p.forecast[p.forecast.length - 1].total)}`)
            .join(', ')}.`}
          preserveAspectRatio="xMidYMid meet"
        >
          {yTicks.map((t, i) => (
            <g key={i}>
              <line className="grid" x1={pad.left} x2={width - pad.right} y1={t.yPos} y2={t.yPos} />
              <text className="axis-label" x={pad.left - 8} y={t.yPos + 4} textAnchor="end">
                {formatCurrency(t.value)}
              </text>
            </g>
          ))}
          {xTicks.map((age) => (
            <text key={age} className="axis-label" x={x(age)} y={height - 8} textAnchor="middle">
              {age}
            </text>
          ))}
          {plans.map((p, i) => {
            const path = p.forecast
              .map((r, j) => `${j === 0 ? 'M' : 'L'}${x(r.age).toFixed(1)},${y(r.total).toFixed(1)}`)
              .join(' ')
            return (
              <path key={p.id} className={`chart-line compare-line-${i % 5}`} d={path} />
            )
          })}
        </svg>
      </div>
    </section>
  )
}
