import { NumberField } from './fields'
import { rateToPercent, percentToRate } from '../utils/format'

interface Props {
  rateOfReturn: number
  endAge: number
  onRateChange: (rate: number) => void
  onEndAgeChange: (age: number) => void
}

export function GlobalAssumptionsForm({
  rateOfReturn,
  endAge,
  onRateChange,
  onEndAgeChange,
}: Props) {
  const percent = rateToPercent(rateOfReturn)

  return (
    <section className="card">
      <h2>Global assumptions</h2>
      <div className="field-grid">
        <div className="field field-wide">
          <span className="field-label">Annual rate of return ({percent}%)</span>
          <div className="slider-row">
            <input
              type="range"
              min={0}
              max={15}
              step={0.1}
              value={percent}
              aria-label="Rate of return slider"
              onChange={(e) => onRateChange(percentToRate(parseFloat(e.target.value)))}
            />
            <div className="input-affix slider-number">
              <input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={percent}
                aria-label="Rate of return percent"
                onChange={(e) => {
                  const n = parseFloat(e.target.value)
                  if (Number.isFinite(n)) onRateChange(percentToRate(n))
                }}
              />
              <span className="affix affix-suffix">%</span>
            </div>
          </div>
        </div>
        <NumberField
          id="endAge"
          label="Projection end age"
          value={endAge}
          min={0}
          max={130}
          onChange={onEndAgeChange}
        />
      </div>
    </section>
  )
}
