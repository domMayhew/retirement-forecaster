import { useMemo } from 'react'
import type { Forecast, ForecastInput } from '../engine/types'
import { formatCurrency } from '../utils/format'
import {
  findMinimumSurvivingRate,
  MIN_RATE_SEARCH_LOWER,
  MIN_RATE_SEARCH_UPPER,
} from '../engine/breakEvenRate'

interface Props {
  forecast: Forecast
  input: ForecastInput
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export function ResultsSummary({ forecast, input }: Props) {
  const minRate = useMemo(() => findMinimumSurvivingRate(input), [input])

  if (forecast.length === 0) return null

  const lastRow = forecast[forecast.length - 1]
  const depletedRow = forecast.find((row) => row.shortfall)
  const hasRetirementYears = forecast.some((row) => row.phase === 'retirement')

  let minRateLabel: string
  if (minRate.alwaysSurvives) {
    minRateLabel = `Below ${pct(MIN_RATE_SEARCH_LOWER)}`
  } else if (minRate.neverSurvives) {
    minRateLabel = `Above ${pct(MIN_RATE_SEARCH_UPPER)} (not realistic)`
  } else {
    minRateLabel = pct(minRate.rate)
  }

  return (
    <section className="card">
      <h2>Summary</h2>
      <div className="summary-stats">
        {hasRetirementYears && (
          <div className="summary-stat">
            <span className="summary-stat-label">
              {depletedRow ? 'Savings last until age' : `Savings left at age ${lastRow.age}`}
            </span>
            <span className="summary-stat-value">
              {depletedRow ? depletedRow.age - 1 : formatCurrency(lastRow.total)}
            </span>
          </div>
        )}
        <div className="summary-stat">
          <span className="summary-stat-label">
            Minimum return to make it to age {lastRow.age}
          </span>
          <span className="summary-stat-value">{minRateLabel}</span>
        </div>
      </div>
    </section>
  )
}
