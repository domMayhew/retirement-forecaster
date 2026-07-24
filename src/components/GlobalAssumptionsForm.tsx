import { NumberField } from './fields'
import { RateOfReturnControl } from './RateOfReturnControl'

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
    </section>
  )
}
