// ---------------------------------------------------------------------------
// Year-to-year variability in the assumed rate of return.
//
// Instead of the same flat rate every year, a plan can specify a best-year
// and worst-year return alongside the average. Each year then gets its own
// pseudo-random rate: centered on the average, tapering off toward the
// bounds (a triangular distribution), and seeded so the exact same sequence
// reproduces whenever the plan is reloaded. "Re-forecast" just rolls a new
// seed.
// ---------------------------------------------------------------------------

/**
 * A small, fast, seeded 32-bit PRNG (mulberry32). Deterministic: the same
 * seed always produces the same sequence of floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh, unpredictable seed for starting a brand-new (unsaved) plan. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

/**
 * Keeps worst <= average <= best. Equal bounds (the default) mean no
 * variability — a flat rate every year — so this only ever pulls worst DOWN
 * to average or best UP to average, never the other way, and never breaks
 * that degenerate case.
 */
export function clampBounds(
  average: number,
  worst: number,
  best: number,
): { worst: number; best: number } {
  return { worst: Math.min(worst, average), best: Math.max(best, average) }
}

/**
 * One pseudo-random annual return: centered on `average`, bounded by (but not
 * guaranteed to reach) `worst` and `best`. Uses the sum of two draws from the
 * RNG (a triangular distribution over (-1, 1) that peaks at 0), so most years
 * land close to average with only occasional years approaching the bounds —
 * a rough stand-in for how real returns cluster instead of bouncing between
 * extremes every year.
 */
export function yearlyReturn(
  rng: () => number,
  average: number,
  worst: number,
  best: number,
): number {
  // Guard against a misconfigured/inverted range (best below average, or
  // worst above it) rather than letting it invert the skew. The UI is
  // expected to keep this from happening in the first place (see
  // `clampBounds`), but the engine shouldn't trust that blindly.
  const { worst: effectiveWorst, best: effectiveBest } = clampBounds(average, worst, best)

  const variate = rng() + rng() - 1 // triangular over (-1, 1), peak density at 0
  return variate >= 0
    ? average + variate * (effectiveBest - average)
    : average + variate * (average - effectiveWorst)
}

/** A reproducible sequence of `count` annual returns for a given seed. */
export function yearlyReturns(
  seed: number,
  count: number,
  average: number,
  worst: number,
  best: number,
): number[] {
  const rng = mulberry32(seed)
  return Array.from({ length: Math.max(0, count) }, () =>
    yearlyReturn(rng, average, worst, best),
  )
}
