// ---------------------------------------------------------------------------
// Retirement forecaster — calculation engine.
//
// The engine is built from small pure functions so each piece can be unit
// tested in isolation:
//   - computeAccumulationYear   : one year of saving
//   - computeRetirementWithdrawal: one year of drawing down
//   - runForecast               : stitches the years together
//
// GROWTH-TIMING CONVENTION (used EVERYWHERE, both phases):
//   "flow first, then grow."
//   End-of-year balance = (start-of-year balance + net flow) * (1 + rateOfReturn)
//   - Accumulation: add the year's contributions, then apply growth to the
//     whole balance. Contributions therefore earn a full year of growth.
//   - Retirement: subtract the year's withdrawals, then apply growth to what
//     remains. Withdrawals are computed against the START-of-year balances
//     (before growth), which is what makes them hand-checkable.
// ---------------------------------------------------------------------------

import type {
  Forecast,
  ForecastInput,
  ForecastYear,
  RetirementPlan,
  SavingsPlanSegment,
} from './types'

// --- Defaults -------------------------------------------------------------
// The UI is expected to pass fully-populated objects, but these keep the pure
// functions and any partial callers well-behaved.
export const DEFAULT_INCOME_TAX_RATE = 0.25
export const DEFAULT_REFUND_REINVEST_FRACTION = 1.0
export const DEFAULT_RETIREMENT_TAX_RATE = 0.15
export const DEFAULT_END_AGE = 100

// ---------------------------------------------------------------------------
// ACCUMULATION
// ---------------------------------------------------------------------------

export interface AccumulationYearResult {
  /** End-of-year RRSP balance (after contribution + growth). */
  rrsp: number
  /** End-of-year TFSA balance (after contribution + growth). */
  tfsa: number
  /**
   * Total RRSP money paid in this year: the plain contribution PLUS the
   * reinvested portion of the tax refund it generated.
   */
  rrspContribution: number
  /** Total TFSA money paid in this year. */
  tfsaContribution: number
}

/**
 * Compute one accumulation (saving) year for a given active plan segment.
 *
 * RRSP:
 *   base contribution     = monthlyRRSP * 12
 *   tax refund            = base contribution * incomeTaxRate
 *   reinvested refund     = refund * refundReinvestFraction
 *   total RRSP contribution = base contribution + reinvested refund
 *   (the un-reinvested remainder of the refund is treated as spending and
 *    is NOT tracked anywhere.)
 *
 * TFSA:
 *   contribution          = monthlyTFSA * 12   (no refund mechanic)
 *
 * Balances then grow: end = (start + contribution) * (1 + rateOfReturn).
 */
export function computeAccumulationYear(
  startRRSP: number,
  startTFSA: number,
  segment: SavingsPlanSegment,
  incomeTaxRate: number,
  rateOfReturn: number,
): AccumulationYearResult {
  const baseRRSP = segment.monthlyRRSP * 12
  const refund = baseRRSP * incomeTaxRate
  const reinvested = refund * segment.refundReinvestFraction
  const rrspContribution = baseRRSP + reinvested

  const tfsaContribution = segment.monthlyTFSA * 12

  const rrsp = (startRRSP + rrspContribution) * (1 + rateOfReturn)
  const tfsa = (startTFSA + tfsaContribution) * (1 + rateOfReturn)

  return { rrsp, tfsa, rrspContribution, tfsaContribution }
}

// ---------------------------------------------------------------------------
// RETIREMENT
// ---------------------------------------------------------------------------

export interface RetirementWithdrawalResult {
  rrspWithdrawal: number
  tfsaWithdrawal: number
  /** Tax paid on the RRSP portion of the withdrawal. */
  taxPaid: number
  /** After-tax cash delivered to the saver. Equals `gap` unless there is a shortfall. */
  netFromSavings: number
  /** True when balances could not cover the required withdrawal. */
  shortfall: boolean
}

/**
 * Work out the withdrawals needed to net `gap` dollars of after-tax income
 * from the two accounts, taking the SAME PERCENTAGE from each.
 *
 * Only the RRSP portion is taxable (at retirementTaxRate); TFSA is tax-free.
 * We solve exactly for the gross withdrawal so the after-tax cash equals gap:
 *
 *   rrspShare       = rrsp / (rrsp + tfsa)
 *   netTaxRate      = rrspShare * retirementTaxRate
 *   actualWithdrawal = gap / (1 - netTaxRate)
 *   withdrawalPct   = actualWithdrawal / (rrsp + tfsa)
 *   rrspWithdrawal  = withdrawalPct * rrsp
 *   tfsaWithdrawal  = withdrawalPct * tfsa
 *   taxPaid         = rrspWithdrawal * retirementTaxRate
 *   netFromSavings  = (rrspWithdrawal - taxPaid) + tfsaWithdrawal   // === gap
 *
 * Edge cases:
 *   - gap <= 0            : no withdrawal, no shortfall.
 *   - total balance == 0  : nothing to withdraw, shortfall = true.
 *   - actualWithdrawal > total balance : drain both accounts, shortfall = true.
 *
 * NOTE: `startRRSP`/`startTFSA` are the START-of-year balances (growth for the
 * year has not been applied yet — see the growth-timing convention).
 */
export function computeRetirementWithdrawal(
  startRRSP: number,
  startTFSA: number,
  gap: number,
  retirementTaxRate: number,
): RetirementWithdrawalResult {
  const total = startRRSP + startTFSA

  // Nothing required from savings this year.
  if (gap <= 0) {
    return {
      rrspWithdrawal: 0,
      tfsaWithdrawal: 0,
      taxPaid: 0,
      netFromSavings: 0,
      shortfall: false,
    }
  }

  // Money is needed but there is none.
  if (total <= 0) {
    return {
      rrspWithdrawal: 0,
      tfsaWithdrawal: 0,
      taxPaid: 0,
      netFromSavings: 0,
      shortfall: true,
    }
  }

  const rrspShare = startRRSP / total
  const netTaxRate = rrspShare * retirementTaxRate
  const actualWithdrawal = gap / (1 - netTaxRate)

  // Not enough saved to meet the gap: drain everything available.
  if (actualWithdrawal > total) {
    const taxPaid = startRRSP * retirementTaxRate
    const netFromSavings = startRRSP - taxPaid + startTFSA
    return {
      rrspWithdrawal: startRRSP,
      tfsaWithdrawal: startTFSA,
      taxPaid,
      netFromSavings,
      shortfall: true,
    }
  }

  const withdrawalPct = actualWithdrawal / total
  const rrspWithdrawal = withdrawalPct * startRRSP
  const tfsaWithdrawal = withdrawalPct * startTFSA
  const taxPaid = rrspWithdrawal * retirementTaxRate
  const netFromSavings = rrspWithdrawal - taxPaid + tfsaWithdrawal

  return { rrspWithdrawal, tfsaWithdrawal, taxPaid, netFromSavings, shortfall: false }
}

// TODO(age-72-mandatory-withdrawal): Starting at age 72 there is a mandatory
// minimum RRSP withdrawal of 5% of the RRSP balance, regardless of income need.
// The human explicitly deferred this — DO NOT wire it into runForecast yet.
// When implemented it will take the max of (income-gap withdrawal, 5% of RRSP)
// from the RRSP, with the excess over the income need still taxed.

// ---------------------------------------------------------------------------
// RETIREMENT INCOME HELPERS
// ---------------------------------------------------------------------------

/** CPP is paid once age >= cppStartAge, otherwise 0. */
export function cppForAge(age: number, plan: RetirementPlan): number {
  return age >= plan.cppStartAge ? plan.cppAnnual : 0
}

/** OAS is paid once age >= oasStartAge, otherwise 0. */
export function oasForAge(age: number, plan: RetirementPlan): number {
  return age >= plan.oasStartAge ? plan.oasAnnual : 0
}

// ---------------------------------------------------------------------------
// PLAN SEGMENT SELECTION
// ---------------------------------------------------------------------------

/**
 * The active segment for a given age is the first segment (segments are
 * ordered by increasing untilAge) whose untilAge >= age. If age is beyond the
 * last segment's untilAge, the last segment applies.
 */
export function activeSegmentForAge(
  age: number,
  segments: SavingsPlanSegment[],
): SavingsPlanSegment {
  for (const segment of segments) {
    if (age <= segment.untilAge) return segment
  }
  return segments[segments.length - 1]
}

// ---------------------------------------------------------------------------
// FULL FORECAST
// ---------------------------------------------------------------------------

/**
 * Run the whole projection.
 *
 * PHASES (disjoint, every age covered exactly once):
 *   accumulation : ages [currentAge, retirementAge)   — i.e. up to retirementAge - 1
 *   retirement   : ages [retirementAge, endAge]        — inclusive of endAge
 *
 * The last saving year is retirementAge - 1; at retirementAge the saver is
 * retired and begins drawing down.
 */
export function runForecast(input: ForecastInput): Forecast {
  const { initial, savingsPlan, retirement, rateOfReturn, endAge } = input
  const { currentAge, retirementAge, incomeTaxRate } = initial

  const requiredAnnualIncome = retirement.requiredMonthlyIncome * 12

  const rows: ForecastYear[] = []

  let rrsp = initial.currentRRSP
  let tfsa = initial.currentTFSA

  // --- Accumulation: currentAge .. retirementAge - 1 ---------------------
  for (let age = currentAge; age < retirementAge; age++) {
    const segment = activeSegmentForAge(age, savingsPlan)
    const year = computeAccumulationYear(rrsp, tfsa, segment, incomeTaxRate, rateOfReturn)

    rrsp = year.rrsp
    tfsa = year.tfsa

    rows.push({
      age,
      phase: 'accumulation',
      rrsp,
      tfsa,
      total: rrsp + tfsa,
      rrspContribution: year.rrspContribution,
      tfsaContribution: year.tfsaContribution,
      rrspWithdrawal: 0,
      tfsaWithdrawal: 0,
      cpp: 0,
      oas: 0,
      netFromSavings: 0,
      taxPaid: 0,
      shortfall: false,
    })
  }

  // --- Retirement: retirementAge .. endAge (inclusive) -------------------
  for (let age = retirementAge; age <= endAge; age++) {
    const cpp = cppForAge(age, retirement)
    const oas = oasForAge(age, retirement)
    const gap = requiredAnnualIncome - cpp - oas

    const w = computeRetirementWithdrawal(rrsp, tfsa, gap, retirement.retirementTaxRate)

    // Growth applies AFTER withdrawal (flow first, then grow).
    rrsp = (rrsp - w.rrspWithdrawal) * (1 + rateOfReturn)
    tfsa = (tfsa - w.tfsaWithdrawal) * (1 + rateOfReturn)

    rows.push({
      age,
      phase: 'retirement',
      rrsp,
      tfsa,
      total: rrsp + tfsa,
      rrspContribution: 0,
      tfsaContribution: 0,
      rrspWithdrawal: w.rrspWithdrawal,
      tfsaWithdrawal: w.tfsaWithdrawal,
      cpp,
      oas,
      netFromSavings: w.netFromSavings,
      taxPaid: w.taxPaid,
      shortfall: w.shortfall,
    })
  }

  return rows
}
