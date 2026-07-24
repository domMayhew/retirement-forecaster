import { rateToPercent, percentToRate } from '../utils/format'

interface Props {
  rateOfReturn: number
  onRateChange: (rate: number) => void
}

/** The slider + numeric field for the global assumed rate of return, shared between the Results view's Global assumptions card and the Compare view. */
export function RateOfReturnControl({ rateOfReturn, onRateChange }: Props) {
  const percent = rateToPercent(rateOfReturn)

  return (
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
  )
}
