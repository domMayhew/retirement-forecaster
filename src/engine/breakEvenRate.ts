// ---------------------------------------------------------------------------
// Minimum rate of return needed for savings to last the whole projection.
//
// There's no closed form for this — contribution segments, the RRIF
// mandatory minimum, contribution room, and manual overrides all make the
// relationship between rate of return and outcome too tangled to solve
// directly. Survival IS monotonic in the rate of return though (more growth
// only ever helps, both by growing the nest egg faster during accumulation
// and by shrinking it slower during retirement), so a binary search over a
// generous range of candidate rates finds the threshold reliably.
// ---------------------------------------------------------------------------

import type { ForecastInput } from './types'
import { runForecast } from './forecast'

/** Search bounds for the binary search — generous enough to cover any realistic (and most unrealistic) plans. */
export const MIN_RATE_SEARCH_LOWER = -0.3
export const MIN_RATE_SEARCH_UPPER = 0.5

const TOLERANCE = 0.0005
const MAX_ITERATIONS = 40

/** Whether this plan's savings cover the required income all the way through endAge at the given assumed rate of return. */
export function survivesThroughEndAge(input: ForecastInput, rateOfReturn: number): boolean {
  const forecast = runForecast({ ...input, rateOfReturn })
  return forecast.length > 0 && !forecast.some((row) => row.shortfall)
}

export interface MinimumRateResult {
  /**
   * The minimum annual rate of return needed for the plan to survive through
   * endAge. When alwaysSurvives or neverSurvives is true, this is just the
   * nearest search bound, not a precise threshold.
   */
  rate: number
  /** The plan already survives at the lowest rate searched — no real minimum applies. */
  alwaysSurvives: boolean
  /** The plan fails to survive even at the highest rate searched. */
  neverSurvives: boolean
}

export function findMinimumSurvivingRate(input: ForecastInput): MinimumRateResult {
  if (survivesThroughEndAge(input, MIN_RATE_SEARCH_LOWER)) {
    return { rate: MIN_RATE_SEARCH_LOWER, alwaysSurvives: true, neverSurvives: false }
  }
  if (!survivesThroughEndAge(input, MIN_RATE_SEARCH_UPPER)) {
    return { rate: MIN_RATE_SEARCH_UPPER, alwaysSurvives: false, neverSurvives: true }
  }

  // Standard bisection: hi always survives, lo never does.
  let lo = MIN_RATE_SEARCH_LOWER
  let hi = MIN_RATE_SEARCH_UPPER
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > TOLERANCE; i++) {
    const mid = (lo + hi) / 2
    if (survivesThroughEndAge(input, mid)) hi = mid
    else lo = mid
  }
  return { rate: hi, alwaysSurvives: false, neverSurvives: false }
}
