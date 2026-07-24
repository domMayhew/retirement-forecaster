import type { Forecast } from '../engine/types'
import { formatCurrency } from '../utils/format'

interface Props {
  forecast: Forecast
}

// A dependency-free inline-SVG line chart of total savings over time.
export function SavingsChart({ forecast }: Props) {
  if (forecast.length < 2) return null

  const width = 640
  const height = 220
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
  const y = (total: number) => pad.top + innerH - (total / maxTotal) * innerH

  const path = forecast
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.age).toFixed(1)},${y(r.total).toFixed(1)}`)
    .join(' ')

  const areaPath =
    `${path} L${x(maxAge).toFixed(1)},${(pad.top + innerH).toFixed(1)} ` +
    `L${x(minAge).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: maxTotal * f,
    yPos: pad.top + innerH - f * innerH,
  }))

  return (
    <section className="card">
      <h2>Total savings over time</h2>
      <div className="table-scroll">
        <svg
          className="chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Line chart of total savings from retirement age onward"
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
          <text className="axis-label" x={x(minAge)} y={height - 8} textAnchor="middle">
            {minAge}
          </text>
          <text className="axis-label" x={x(maxAge)} y={height - 8} textAnchor="middle">
            {maxAge}
          </text>
          <path className="chart-area" d={areaPath} />
          <path className="chart-line" d={path} />
        </svg>
      </div>
    </section>
  )
}
