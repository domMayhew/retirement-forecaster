import type { InitialConditions } from '../engine/types'
import { NumberField, CurrencyField, PercentField } from './fields'

interface Props {
  value: InitialConditions
  onChange: (patch: Partial<InitialConditions>) => void
}

export function InitialConditionsForm({ value, onChange }: Props) {
  return (
    <section className="card">
      <h2>Initial conditions</h2>
      <div className="field-grid">
        <NumberField
          id="currentAge"
          label="Current age"
          value={value.currentAge}
          min={0}
          max={120}
          onChange={(v) => onChange({ currentAge: v })}
        />
        <NumberField
          id="retirementAge"
          label="Expected retirement age"
          value={value.retirementAge}
          min={0}
          max={120}
          onChange={(v) => onChange({ retirementAge: v })}
        />
        <CurrencyField
          id="currentRRSP"
          label="Current RRSP balance"
          value={value.currentRRSP}
          onChange={(v) => onChange({ currentRRSP: v })}
        />
        <CurrencyField
          id="currentTFSA"
          label="Current TFSA balance"
          value={value.currentTFSA}
          onChange={(v) => onChange({ currentTFSA: v })}
        />
        <CurrencyField
          id="currentIncome"
          label="Current annual income"
          value={value.currentIncome}
          onChange={(v) => onChange({ currentIncome: v })}
        />
        <PercentField
          id="incomeTaxRate"
          label="Current income tax rate"
          value={value.incomeTaxRate}
          onChange={(v) => onChange({ incomeTaxRate: v })}
        />
        <CurrencyField
          id="currentRRSPRoom"
          label="Current RRSP contribution room"
          value={value.currentRRSPRoom}
          onChange={(v) => onChange({ currentRRSPRoom: v })}
        />
      </div>
      <p className="field-hint">
        From your latest CRA Notice of Assessment. Grows automatically by 18%
        of your income each year (capped at the annual CRA limit) and is
        reduced by RRSP contributions.
      </p>
    </section>
  )
}
