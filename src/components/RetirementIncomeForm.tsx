import type { RetirementIncomeSegment } from '../engine/types'
import { BareNumberInput } from './fields'

interface Props {
  segments: RetirementIncomeSegment[]
  endAge: number
  onChange: (segments: RetirementIncomeSegment[]) => void
}

/** Returns a per-row error string (or null) for the "until age" ordering rule. */
export function validateIncomeSegments(segments: RetirementIncomeSegment[]): (string | null)[] {
  return segments.map((seg, i) => {
    if (i === 0) return null
    const prev = segments[i - 1]
    if (seg.untilAge <= prev.untilAge) {
      return `"Until age" (${seg.untilAge}) must be greater than the previous row's (${prev.untilAge}).`
    }
    return null
  })
}

let idCounter = 0
function newId(): string {
  idCounter += 1
  return `income-${Date.now().toString(36)}-${idCounter}`
}

export function RetirementIncomeForm({ segments, endAge, onChange }: Props) {
  const errors = validateIncomeSegments(segments)

  function update(index: number, patch: Partial<RetirementIncomeSegment>) {
    onChange(segments.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function addRow() {
    const last = segments[segments.length - 1]
    const untilAge = last ? Math.max(last.untilAge + 5, endAge) : endAge
    onChange([
      ...segments,
      {
        id: newId(),
        requiredMonthlyIncome: last ? last.requiredMonthlyIncome : 4000,
        untilAge,
      },
    ])
  }

  function removeRow(index: number) {
    onChange(segments.filter((_, i) => i !== index))
  }

  return (
    <section className="card">
      <h2>Retirement income plan</h2>
      <p className="chart-subtitle">
        Stage your required monthly income through retirement — e.g. more spending in the
        first active years, tapering off later.
      </p>
      <div className="table-scroll">
        <table className="segments">
          <thead>
            <tr>
              <th>#</th>
              <th>Required monthly income (after tax)</th>
              <th>Until age</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg, i) => (
              <tr key={seg.id} className={errors[i] ? 'row-invalid' : undefined}>
                <td className="row-num">{i + 1}</td>
                <td>
                  <div className="cell-affix">
                    <span className="affix">$</span>
                    <BareNumberInput
                      label=""
                      min={0}
                      step={50}
                      value={seg.requiredMonthlyIncome}
                      ariaLabel={`Row ${i + 1} required monthly income`}
                      onChange={(v) => update(i, { requiredMonthlyIncome: v })}
                    />
                  </div>
                </td>
                <td>
                  <BareNumberInput
                    label=""
                    min={0}
                    max={130}
                    value={seg.untilAge}
                    ariaLabel={`Row ${i + 1} until age`}
                    onChange={(v) => update(i, { untilAge: v })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-remove"
                    aria-label={`Remove row ${i + 1}`}
                    onClick={() => removeRow(i)}
                    disabled={segments.length <= 1}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errors.some(Boolean) && (
        <ul className="validation">
          {errors.map((err, i) =>
            err ? <li key={segments[i].id}>Row {i + 1}: {err}</li> : null,
          )}
        </ul>
      )}

      <button type="button" className="btn-add" onClick={addRow}>
        + Add row
      </button>
    </section>
  )
}
