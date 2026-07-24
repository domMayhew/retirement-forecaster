// ---------------------------------------------------------------------------
// Year-to-year variability in the assumed rate of return.
//
// Instead of the same flat rate every year, a plan can specify a best-year
// and worst-year return alongside the average. Each year then gets its own
// pseudo-random rate from a Beta distribution rescaled to [worst, best],
// shaped so its MEAN is exactly `average` — regardless of how asymmetric the
// bounds are around it (a bigger downside than upside, say, which is the
// realistic common case) — so a long enough run's realized average return
// converges on the stated average instead of silently drifting toward
// whichever side has the bigger spread. (An earlier version of this scaled a
// symmetric variate by different up/down factors, which is exactly the bug
// that caused that drift — see the "asymmetric bounds" tests below. A
// triangular distribution is the next-simplest fix, but only reaches an
// exact mean when the average sits in the middle third between worst and
// best; Beta can hit any mean strictly between the bounds, for any skew.)
// Seeded so the exact same sequence reproduces whenever the plan is
// reloaded; "Re-forecast" just rolls a new seed.
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
 * A standard normal (mean 0, variance 1) sample via the Box-Muller
 * transform — the standard way to turn uniform draws into normal ones.
 */
function standardNormal(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON) // rng() can return exactly 0; avoid log(0).
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * A Gamma(shape, 1) sample via Marsaglia & Tsang's method — the standard
 * algorithm used by most statistics libraries. `shape` must be > 0.
 */
function gammaSample(rng: () => number, shape: number): number {
  if (shape < 1) {
    // Boost trick: Gamma(shape) = Gamma(shape + 1) * U^(1/shape).
    const boosted = gammaSample(rng, shape + 1)
    const u = Math.max(rng(), Number.EPSILON)
    return boosted * Math.pow(u, 1 / shape)
  }

  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = standardNormal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    const xSquared = x * x
    if (u < 1 - 0.0331 * xSquared * xSquared) return d * v
    if (Math.log(u) < 0.5 * xSquared + d * (1 - v + Math.log(v))) return d * v
  }
}

/** A Beta(alpha, beta) sample via the ratio of two Gammas. Both shape parameters must be > 0. */
function betaSample(rng: () => number, alpha: number, beta: number): number {
  const x = gammaSample(rng, alpha)
  const y = gammaSample(rng, beta)
  return x / (x + y)
}

// How tightly a year's return clusters around the average vs. spreading
// toward the bounds — split between the two Beta shape parameters in
// proportion to where the average sits in [worst, best]. Higher = tighter
// clustering; this is just a "feel" tuning constant, not derived from data.
const CONCENTRATION = 4
// Keeps both Beta shape parameters comfortably away from 0, which is only
// ever needed when the average sits extremely close to one bound (where no
// distribution with any spread can hit that mean exactly — see below).
const MIN_SHAPE = 0.05

/**
 * One pseudo-random annual return, drawn from a Beta distribution rescaled
 * to [worst, best] and shaped so its mean is `average` — clustering most
 * years near the middle and tapering toward the bounds, same as before, but
 * unlike a plain triangular distribution this can hit that exact mean for
 * ANY skew, not just when `average` sits roughly centered between the
 * bounds. The one case it can't (nor could anything else): `average`
 * sitting essentially AT one bound — a distribution with any real chance of
 * reaching past that bound necessarily has a mean strictly beyond it, so
 * hitting the bound exactly as a mean requires a distribution with no
 * spread there at all.
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
  const { worst: lo, best: hi } = clampBounds(average, worst, best)
  if (hi <= lo) return average // degenerate: no room for variability

  const p = (average - lo) / (hi - lo) // where the target mean sits, 0..1
  const alpha = Math.max(MIN_SHAPE, CONCENTRATION * p)
  const beta = Math.max(MIN_SHAPE, CONCENTRATION * (1 - p))
  return lo + (hi - lo) * betaSample(rng, alpha, beta)
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
