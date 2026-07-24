import { useEffect, useState } from 'react'
import { rateToPercent, percentToRate } from '../utils/format'

interface Props {
  rateOfReturn: number
  onRateChange: (rate: number) => void
}

/** The slider + numeric field for the global assumed rate of return, shared between the Results view's Global assumptions card and the Compare view. */
export function RateOfReturnControl({ rateOfReturn, onRateChange }: Props) {
  const percent = rateToPercent(rateOfReturn)
  // A local string buffer so the numeric field can sit empty, or mid-edit
  // ("-", "1."), while typing instead of snapping back on every keystroke.
  const [buffer, setBuffer] = useState(String(percent))

  useEffect(() => {
    if (percentToRate(parseFloat(buffer)) !== rateOfReturn) setBuffer(String(percent))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateOfReturn])

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
            inputMode="decimal"
            min={0}
            max={30}
            step={0.1}
            value={buffer}
            aria-label="Rate of return percent"
            onChange={(e) => {
              setBuffer(e.target.value)
              const n = parseFloat(e.target.value)
              if (Number.isFinite(n)) onRateChange(percentToRate(n))
            }}
            onBlur={() => setBuffer(String(rateToPercent(rateOfReturn)))}
          />
          <span className="affix affix-suffix">%</span>
        </div>
      </div>
    </div>
  )
}
