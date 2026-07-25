import type { RetirementPlan } from '../engine/types'
import { NumberField, CurrencyField, PercentField } from './fields'

interface Props {
  value: RetirementPlan
  onChange: (patch: Partial<RetirementPlan>) => void
  reinvestForcedWithdrawals: boolean
  onReinvestForcedWithdrawalsChange: (value: boolean) => void
}

export function RetirementPlanForm({
  value,
  onChange,
  reinvestForcedWithdrawals,
  onReinvestForcedWithdrawalsChange,
}: Props) {
  return (
    <section className="card">
      <h2>Retirement plan</h2>
      <div className="field-grid">
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
