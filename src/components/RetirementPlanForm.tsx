import type { RetirementPlan } from '../engine/types'
import { NumberField, CurrencyField, PercentField } from './fields'

interface Props {
  value: RetirementPlan
  onChange: (patch: Partial<RetirementPlan>) => void
}

export function RetirementPlanForm({ value, onChange }: Props) {
  return (
    <section className="card">
      <h2>Retirement plan</h2>
      <div className="field-grid">
        <CurrencyField
          id="requiredMonthlyIncome"
          label="Required monthly income (after tax)"
          value={value.requiredMonthlyIncome}
          onChange={(v) => onChange({ requiredMonthlyIncome: v })}
        />
        <PercentField
          id="retirementTaxRate"
          label="Expected retirement tax rate"
          value={value.retirementTaxRate}
          onChange={(v) => onChange({ retirementTaxRate: v })}
        />
        <CurrencyField
          id="cppAnnual"
          label="Expected CPP income (annual)"
          value={value.cppAnnual}
          onChange={(v) => onChange({ cppAnnual: v })}
        />
        <NumberField
          id="cppStartAge"
          label="CPP start age"
          value={value.cppStartAge}
          min={0}
          max={120}
          onChange={(v) => onChange({ cppStartAge: v })}
        />
        <CurrencyField
          id="oasAnnual"
          label="Expected OAS income (annual)"
          value={value.oasAnnual}
          onChange={(v) => onChange({ oasAnnual: v })}
        />
        <NumberField
          id="oasStartAge"
          label="OAS start age"
          value={value.oasStartAge}
          min={0}
          max={120}
          onChange={(v) => onChange({ oasStartAge: v })}
        />
      </div>
    </section>
  )
}
