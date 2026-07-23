// Formatting + conversion helpers shared across the UI.
//
// The domain types store all rates as decimals (0.05 = 5%). The UI, however,
// lets people type whole percents ("25" meaning 25%). These helpers are the
// single place where that conversion happens, so it stays consistent.

/** Format a dollar amount as e.g. "$1,234,567" (rounded to whole dollars). */
export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '$0'
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  return sign + '$' + Math.abs(rounded).toLocaleString('en-US')
}

/** Decimal rate (0.25) -> percent number for display (25). */
export function rateToPercent(rate: number): number {
  // Round to 4 significant fractional digits to avoid float noise like 25.0000001.
  return Math.round(rate * 100 * 10000) / 10000
}

/** Percent number as typed (25) -> decimal rate for the model (0.25). */
export function percentToRate(percent: number): number {
  return percent / 100
}
