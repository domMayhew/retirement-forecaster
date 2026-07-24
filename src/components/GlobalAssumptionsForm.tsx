import { NumberField, PercentField } from './fields'
import { RateOfReturnControl } from './RateOfReturnControl'

interface Props {
  rateOfReturn: number
  bestYearReturn: number
  worstYearReturn: number
  endAge: number
  seed: number
  onRateChange: (rate: number) => void
  onBestYearReturnChange: (rate: number) => void
  onWorstYearReturnChange: (rate: number) => void
  onEndAgeChange: (age: number) => void
  onReForecast: () => void
}

export function GlobalAssumptionsForm({
  rateOfReturn,
  bestYearReturn,
  worstYearReturn,
  endAge,
  seed,
  onRateChange,
  onBestYearReturnChange,
  onWorstYearReturnChange,
  onEndAgeChange,
  onReForecast,
}: Props) {
  return (
    <section className="card">
      <h2>Global assumptions</h2>
      <div className="field-grid">
        <RateOfReturnControl rateOfReturn={rateOfReturn} onRateChange={onRateChange} />
        <NumberField
          id="endAge"
          label="Projection end age"
          value={endAge}
          min={0}
          max={130}
          onChange={onEndAgeChange}
        />
      </div>
      <p className="variability-hint">
        Add year-to-year variability by widening the best/worst year below —
        leave them equal to the average for a flat rate every year.
      </p>
      <div className="field-grid">
        <PercentField
          id="worstYearReturn"
          label="Worst year"
          value={worstYearReturn}
          min={-100}
          // Soft guidance (nudges the spinner, doesn't hard-block typing) so
          // the range can't invert around the average.
          max={rateOfReturn * 100}
          onChange={onWorstYearReturnChange}
        />
        <PercentField
          id="bestYearReturn"
          label="Best year"
          value={bestYearReturn}
          min={rateOfReturn * 100}
          max={100}
          onChange={onBestYearReturnChange}
        />
      </div>
      <div className="reforecast-row">
        <span className="reforecast-seed">Seed: {seed}</span>
        <button type="button" className="btn-edit-toggle" onClick={onReForecast}>
          Re-forecast
        </button>
      </div>
    </section>
  )
}
