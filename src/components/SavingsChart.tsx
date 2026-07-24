import type { Forecast } from '../engine/types'
import { formatCurrency } from '../utils/format'
import { ageTicks } from '../utils/chart'

interface Props {
  forecast: Forecast
}

// A dependency-free inline-SVG chart of savings over time: total (as a
// filled area, since it's the headline number) plus RRSP and TFSA as their
// own lines so the two accounts can be told apart.
export function SavingsChart({ forecast }: Props) {
  if (forecast.length < 2) return null

  const width = 640
  const height = 260
  const pad = { top: 16, right: 16, bottom: 28, left: 64 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const ages = forecast.map((r) => r.age)
  const totals = forecast.map((r) => r.total)
  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)
  const maxTotal = Math.max(...totals, 1)

  const x = (age: number) =>
    pad.left + ((age - minAge) / Math.max(maxAge - minAge, 1)) * innerW
  const y = (value: number) => pad.top + innerH - (value / maxTotal) * innerH

  const linePath = (series: (r: Forecast[number]) => number) =>
    forecast
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.age).toFixed(1)},${y(series(r)).toFixed(1)}`)
      .join(' ')

  const totalPath = linePath((r) => r.total)
  const rrspPath = linePath((r) => r.rrsp)
  const tfsaPath = linePath((r) => r.tfsa)

  const areaPath =
    `${totalPath} L${x(maxAge).toFixed(1)},${(pad.top + innerH).toFixed(1)} ` +
    `L${x(minAge).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: maxTotal * f,
    yPos: pad.top + innerH - f * innerH,
  }))
  const xTicks = ageTicks(minAge, maxAge)

  const last = forecast[forecast.length - 1]

  return (
    <section className="card">
      <h2>Savings over time</h2>
      <ul className="chart-legend">
        <li>
          <span className="swatch swatch-total" /> Total —{' '}
          <strong>{formatCurrency(last.total)}</strong>
        </li>
        <li>
          <span className="swatch swatch-rrsp" /> RRSP —{' '}
          <strong>{formatCurrency(last.rrsp)}</strong>
        </li>
        <li>
          <span className="swatch swatch-tfsa" /> TFSA —{' '}
          <strong>{formatCurrency(last.tfsa)}</strong>
        </li>
      </ul>
      <div className="table-scroll">
        <svg
          className="chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Line chart of total, RRSP, and TFSA savings from age ${minAge} to ${maxAge}. Ending total ${formatCurrency(last.total)}, RRSP ${formatCurrency(last.rrsp)}, TFSA ${formatCurrency(last.tfsa)}.`}
          preserveAspectRatio="xMidYMid meet"
        >
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                className="grid"
                x1={pad.left}
                x2={width - pad.right}
                y1={t.yPos}
                y2={t.yPos}
              />
              <text className="axis-label" x={pad.left - 8} y={t.yPos + 4} textAnchor="end">
                {formatCurrency(t.value)}
              </text>
            </g>
          ))}
          {xTicks.map((age) => (
            <text key={age} className="axis-label" x={x(age)} y={height - 8} textAnchor="middle">
              {age}
            </text>
          ))}
          <path className="chart-area" d={areaPath} />
          <path className="chart-line chart-line-rrsp" d={rrspPath} />
          <path className="chart-line chart-line-tfsa" d={tfsaPath} />
          <path className="chart-line chart-line-total" d={totalPath} />
        </svg>
      </div>
    </section>
  )
}
