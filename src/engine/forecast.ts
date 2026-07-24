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

// RRSP contribution room accrues each year at 18% of earned income, capped at
// an annual dollar limit set by the CRA and indexed to inflation. $33,810 is
// the 2026 limit; future years are held at this figure as a simplifying
// assumption (the engine has no inflation model elsewhere either).
export const RRSP_ANNUAL_DOLLAR_LIMIT = 33810
export const RRSP_ACCRUAL_RATE = 0.18

// ---------------------------------------------------------------------------
// RRSP CONTRIBUTION ROOM
// ---------------------------------------------------------------------------

/**
 * New RRSP room accrued for one accumulation year: 18% of earned income,
 * capped at the annual CRA dollar limit. Only earned income generates room,
 * so retirement years (CPP/OAS/withdrawals, no earned income) accrue none —
 * callers should only invoke this for accumulation years.
 */
export function rrspRoomAccrual(earnedIncome: number): number {
  return Math.min(Math.max(earnedIncome, 0) * RRSP_ACCRUAL_RATE, RRSP_ANNUAL_DOLLAR_LIMIT)
}

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
  /** Fraction withdrawn from each account (same % from both). 0 when none needed. */
  withdrawalPct: number
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
      withdrawalPct: 0,
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
      withdrawalPct: 0,
      taxPaid: 0,
      netFromSavings: 0,
      shortfall: true,
    }
  }

  const rrspShare = startRRSP / total
  const netTaxRate = rrspShare * retirementTaxRate
  const actualWithdrawal = gap / (1 - netTaxRate)

  // Not enough saved to meet the gap: drain everything available (100%).
  if (actualWithdrawal > total) {
    const taxPaid = startRRSP * retirementTaxRate
    const netFromSavings = startRRSP - taxPaid + startTFSA
    return {
      rrspWithdrawal: startRRSP,
      tfsaWithdrawal: startTFSA,
      withdrawalPct: 1,
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

  return {
    rrspWithdrawal,
    tfsaWithdrawal,
    withdrawalPct,
    taxPaid,
    netFromSavings,
    shortfall: false,
  }
}

// TODO(age-72-mandatory-withdrawal): Starting at age 72 there is a mandatory
// minimum RRSP withdrawal of 5% of the RRSP balance, regardless of income need.
// The human explicitly deferred this — DO NOT wire it into runForecast yet.
// When implemented it will take the max of (income-gap withdrawal, 5% of RRSP)
// from the RRSP, with the excess over the income need still taxed.

// ---------------------------------------------------------------------------
// RETIREMENT INCOME HELPERS
// ---------------------------------------------------------------------------

/**
 * CPP is paid once age >= cppStartAge, otherwise 0. Entered monthly; returned
 * as the GROSS (pre-tax) ANNUAL amount (monthly * 12).
 */
export function cppForAge(age: number, plan: RetirementPlan): number {
  return age >= plan.cppStartAge ? plan.cppMonthly * 12 : 0
}

/**
 * OAS is paid once age >= oasStartAge, otherwise 0. Entered monthly; returned
 * as the GROSS (pre-tax) ANNUAL amount (monthly * 12).
 */
export function oasForAge(age: number, plan: RetirementPlan): number {
  return age >= plan.oasStartAge ? plan.oasMonthly * 12 : 0
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
  let rrspRoom = initial.currentRRSPRoom

  // --- Accumulation: currentAge .. retirementAge - 1 ---------------------
  for (let age = currentAge; age < retirementAge; age++) {
    const segment = activeSegmentForAge(age, savingsPlan)
    const year = computeAccumulationYear(rrsp, tfsa, segment, incomeTaxRate, rateOfReturn)

    rrsp = year.rrsp
    tfsa = year.tfsa
    rrspRoom = rrspRoom + rrspRoomAccrual(initial.currentIncome) - year.rrspContribution

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
      withdrawalPct: 0,
      cpp: 0,
      cppAfterTax: 0,
      oas: 0,
      oasAfterTax: 0,
      netFromSavings: 0,
      taxPaid: 0,
      shortfall: false,
      rrspRoom,
    })
  }

  // --- Retirement: retirementAge .. endAge (inclusive) -------------------
  const taxRate = retirement.retirementTaxRate
  for (let age = retirementAge; age <= endAge; age++) {
    // CPP/OAS are entered PRE-TAX and taxed at the retirement rate, so only
    // their after-tax value counts toward the required (after-tax) income.
    const cpp = cppForAge(age, retirement)
    const oas = oasForAge(age, retirement)
    const cppAfterTax = cpp * (1 - taxRate)
    const oasAfterTax = oas * (1 - taxRate)
    const gap = requiredAnnualIncome - cppAfterTax - oasAfterTax

    const w = computeRetirementWithdrawal(rrsp, tfsa, gap, taxRate)

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
      withdrawalPct: w.withdrawalPct,
      cpp,
      cppAfterTax,
      oas,
      oasAfterTax,
      netFromSavings: w.netFromSavings,
      taxPaid: w.taxPaid,
      shortfall: w.shortfall,
      // No earned income assumed in retirement, so room neither accrues nor
      // is spent — it just carries forward unchanged.
      rrspRoom,
    })
  }

  return rows
}
