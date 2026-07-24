import type { SavingsPlanSegment } from '../engine/types'
import { rateToPercent, percentToRate } from '../utils/format'
import { BareNumberInput } from './fields'

interface Props {
  segments: SavingsPlanSegment[]
  retirementAge: number
  onChange: (segments: SavingsPlanSegment[]) => void
}

/** Returns a per-row error string (or null) for the "until age" ordering rule. */
export function validateSegments(segments: SavingsPlanSegment[]): (string | null)[] {
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
  return `seg-${Date.now().toString(36)}-${idCounter}`
}

export function SavingsPlanForm({ segments, retirementAge, onChange }: Props) {
  const errors = validateSegments(segments)

  function update(index: number, patch: Partial<SavingsPlanSegment>) {
    onChange(segments.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function addRow() {
    const last = segments[segments.length - 1]
    const untilAge = last ? Math.max(last.untilAge + 5, retirementAge) : retirementAge
    onChange([
      ...segments,
      {
        id: newId(),
        monthlyRRSP: last ? last.monthlyRRSP : 500,
        monthlyTFSA: last ? last.monthlyTFSA : 500,
        refundReinvestFraction: 1,
        untilAge,
      },
    ])
  }

  function removeRow(index: number) {
    onChange(segments.filter((_, i) => i !== index))
  }

  return (
    <section className="card">
      <h2>Savings plan</h2>
      <div className="table-scroll">
        <table className="segments">
          <thead>
            <tr>
              <th>#</th>
              <th>Monthly RRSP</th>
              <th>Monthly TFSA</th>
              <th>Refund reinvest %</th>
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
                      value={seg.monthlyRRSP}
                      ariaLabel={`Row ${i + 1} monthly RRSP`}
                      onChange={(v) => update(i, { monthlyRRSP: v })}
                    />
                  </div>
                </td>
                <td>
                  <div className="cell-affix">
                    <span className="affix">$</span>
                    <BareNumberInput
                      label=""
                      min={0}
                      step={50}
                      value={seg.monthlyTFSA}
                      ariaLabel={`Row ${i + 1} monthly TFSA`}
                      onChange={(v) => update(i, { monthlyTFSA: v })}
                    />
                  </div>
                </td>
                <td>
                  <div className="cell-affix">
                    <BareNumberInput
                      label=""
                      min={0}
                      max={100}
                      step={5}
                      value={rateToPercent(seg.refundReinvestFraction)}
                      ariaLabel={`Row ${i + 1} refund reinvest percent`}
                      onChange={(v) => update(i, { refundReinvestFraction: percentToRate(v) })}
                    />
                    <span className="affix affix-suffix">%</span>
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
