import type { Forecast } from '../engine/types'
import { formatCurrency } from '../utils/format'
import { ageTicks } from '../utils/chart'

interface Props {
  forecast: Forecast
}

// A dependency-free inline-SVG line chart of remaining RRSP contribution
// room over time. Renders a zero baseline and shades any stretch that dips
// below it, since negative room means the plan is over-contributing.
export function ContributionRoomChart({ forecast }: Props) {
  if (forecast.length < 2) return null

  const width = 640
  const height = 200
  const pad = { top: 16, right: 16, bottom: 28, left: 76 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const ages = forecast.map((r) => r.age)
  const rooms = forecast.map((r) => r.rrspRoom)
  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)
  const maxRoom = Math.max(...rooms, 1)
  const minRoom = Math.min(...rooms, 0)
  const span = Math.max(maxRoom - minRoom, 1)

  const x = (age: number) =>
    pad.left + ((age - minAge) / Math.max(maxAge - minAge, 1)) * innerW
  const y = (room: number) => pad.top + innerH - ((room - minRoom) / span) * innerH

  const path = forecast
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.age).toFixed(1)},${y(r.rrspRoom).toFixed(1)}`)
    .join(' ')

  const zeroY = y(0)
  const hasNegative = minRoom < 0

  const yTicks = [0, 0.5, 1].map((f) => ({
    value: minRoom + span * f,
    yPos: pad.top + innerH - f * innerH,
  }))
  const xTicks = ageTicks(minAge, maxAge)

  return (
    <section className="card">
      <h2>RRSP contribution room</h2>
      <div className="table-scroll">
        <svg
          className="chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Line chart of remaining RRSP contribution room over time"
          preserveAspectRatio="xMidYMid meet"
        >
          {hasNegative && (
            <rect
              className="chart-danger-zone"
              x={pad.left}
              y={Math.min(zeroY, pad.top + innerH)}
              width={innerW}
              height={Math.max(pad.top + innerH - zeroY, 0)}
            />
          )}
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
          {minRoom < 0 && maxRoom > 0 && (
            <line
              className="chart-zero-line"
              x1={pad.left}
              x2={width - pad.right}
              y1={zeroY}
              y2={zeroY}
            />
          )}
          {xTicks.map((age) => (
            <text key={age} className="axis-label" x={x(age)} y={height - 8} textAnchor="middle">
              {age}
            </text>
          ))}
          <path className={hasNegative ? 'chart-line chart-line-danger' : 'chart-line'} d={path} />
        </svg>
      </div>
    </section>
  )
}
