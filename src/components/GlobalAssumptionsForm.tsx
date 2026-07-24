import { NumberField } from './fields'
import { RateOfReturnControl } from './RateOfReturnControl'

interface Props {
  rateOfReturn: number
  endAge: number
  reinvestForcedWithdrawals: boolean
  onRateChange: (rate: number) => void
  onEndAgeChange: (age: number) => void
  onReinvestForcedWithdrawalsChange: (value: boolean) => void
}

export function GlobalAssumptionsForm({
  rateOfReturn,
  endAge,
  reinvestForcedWithdrawals,
  onRateChange,
  onEndAgeChange,
  onReinvestForcedWithdrawalsChange,
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
      <label
        className="section-toggle forced-withdrawal-toggle"
        title="We don't track this money once it's spent — it just shows up as extra income in years the mandatory RRIF withdrawal forces out more than the plan needs."
      >
        <input
          type="checkbox"
          checked={!reinvestForcedWithdrawals}
          onChange={(e) => onReinvestForcedWithdrawalsChange(!e.target.checked)}
        />
        Spend RRSP money forced out by the RRIF minimum instead of reinvesting it in the TFSA
      </label>
    </section>
  )
}
