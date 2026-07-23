// Small controlled input primitives used by every form section.
//
// Each keeps a local string buffer so that partially-typed values (an empty
// field, a lone "-", a trailing ".") don't fight the user or emit NaN. The
// parsed numeric value is pushed up via onChange; the buffer re-syncs when the
// canonical value changes from outside.
import { useEffect, useState } from 'react'
import { rateToPercent, percentToRate } from '../utils/format'

interface BaseProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  id?: string
}

/** A plain numeric field (dollars, ages, counts). */
export function NumberField({ label, value, onChange, min, max, step, id }: BaseProps) {
  const [buffer, setBuffer] = useState(String(value))

  useEffect(() => {
    if (parseFloat(buffer) !== value) setBuffer(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={buffer}
        onChange={(e) => {
          setBuffer(e.target.value)
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setBuffer(String(value))}
      />
    </label>
  )
}

/** A dollar field: same as NumberField but hints currency with a "$" prefix. */
export function CurrencyField(props: BaseProps) {
  return (
    <label className="field" htmlFor={props.id}>
      <span className="field-label">{props.label}</span>
      <div className="input-affix">
        <span className="affix">$</span>
        <BareNumberInput {...props} min={props.min ?? 0} step={props.step ?? 100} />
      </div>
    </label>
  )
}

/**
 * A percent field. The model stores a decimal (0.25); this shows/accepts the
 * whole-number percent (25) and converts on the way in and out.
 */
export function PercentField({ label, value, onChange, min, max, step, id }: BaseProps) {
  const [buffer, setBuffer] = useState(String(rateToPercent(value)))

  useEffect(() => {
    if (percentToRate(parseFloat(buffer)) !== value) {
      setBuffer(String(rateToPercent(value)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <div className="input-affix">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min ?? 0}
          max={max ?? 100}
          step={step ?? 1}
          value={buffer}
          onChange={(e) => {
            setBuffer(e.target.value)
            const n = parseFloat(e.target.value)
            if (Number.isFinite(n)) onChange(percentToRate(n))
          }}
          onBlur={() => setBuffer(String(rateToPercent(value)))}
        />
        <span className="affix affix-suffix">%</span>
      </div>
    </label>
  )
}

/** Bare numeric <input> without its own <label> — used inside affixed layouts. */
function BareNumberInput({ value, onChange, min, max, step, id }: BaseProps) {
  const [buffer, setBuffer] = useState(String(value))

  useEffect(() => {
    if (parseFloat(buffer) !== value) setBuffer(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={buffer}
      onChange={(e) => {
        setBuffer(e.target.value)
        const n = parseFloat(e.target.value)
        if (Number.isFinite(n)) onChange(n)
      }}
      onBlur={() => setBuffer(String(value))}
    />
  )
}
