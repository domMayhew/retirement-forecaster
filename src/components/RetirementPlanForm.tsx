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
          id="cppMonthly"
          label="Expected CPP income (monthly, pre-tax)"
          value={value.cppMonthly}
          onChange={(v) => onChange({ cppMonthly: v })}
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
          id="oasMonthly"
          label="Expected OAS income (monthly, pre-tax)"
          value={value.oasMonthly}
          onChange={(v) => onChange({ oasMonthly: v })}
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
