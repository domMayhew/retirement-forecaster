// Shared helpers for the inline-SVG charts.

/**
 * Age tick marks for a chart's x-axis: the exact start age, every multiple
 * of 5 after it (e.g. 33, 35, 40, 45, ... 95), and the exact end age — so
 * the axis reads at a glance instead of just showing its two endpoints. A
 * final multiple-of-5 candidate within 3 years of the end age is replaced by
 * the end age itself rather than shown alongside it, so the last two labels
 * don't crowd together.
 */
export function ageTicks(minAge: number, maxAge: number): number[] {
  if (maxAge <= minAge) return [minAge]

  const ticks: number[] = [minAge]
  for (let age = Math.ceil((minAge + 1) / 5) * 5; age < maxAge; age += 5) {
    ticks.push(age)
  }

  const last = ticks[ticks.length - 1]
  if (maxAge - last < 3) {
    ticks[ticks.length - 1] = maxAge
  } else {
    ticks.push(maxAge)
  }
  return ticks
}
