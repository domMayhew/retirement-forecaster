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
  Province,
  RetirementPlan,
  SavingsPlanSegment,
} from './types'
import { yearlyReturns } from './variability'
import { incomeTaxOwed, marginalTaxRate } from './tax'

// --- Defaults -------------------------------------------------------------
// The UI is expected to pass fully-populated objects, but these keep the pure
// functions and any partial callers well-behaved.
export const DEFAULT_REFUND_REINVEST_FRACTION = 1.0
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
  /**
   * Tax attributed to the RRSP withdrawal: CPP/OAS are treated as the "base"
   * layer of taxable income, with the RRSP withdrawal stacked on top, so
   * this is the INCREMENTAL tax that stacking causes — not the RRSP
   * withdrawal's own flat-rate tax, since there is no single flat rate under
   * progressive brackets.
   */
  taxPaid: number
  /** After-tax cash delivered to the saver from savings withdrawals (excludes CPP/OAS). */
  netFromSavings: number
  /** True when balances could not cover the required withdrawal. */
  shortfall: boolean
}

const WITHDRAWAL_PCT_TOLERANCE = 1e-10
const WITHDRAWAL_MAX_ITERATIONS = 100

/**
 * Work out the withdrawals needed to net `requiredAnnualIncome` dollars of
 * after-tax income for the year (CPP/OAS included), taking the SAME
 * PERCENTAGE from each account.
 *
 * Only the RRSP portion is taxable; TFSA is tax-free. But CPP/OAS and the
 * RRSP withdrawal are taxed TOGETHER under progressive brackets (see
 * `./tax.ts`) — the marginal rate on the RRSP withdrawal depends on how much
 * CPP/OAS already fills the lower brackets, so there's no single flat rate
 * to solve for algebraically like a flat-tax model could. Instead this
 * bisects the withdrawal fraction until the resulting after-tax income
 * matches the requirement (the same bisection approach used elsewhere in
 * this engine for other "solve for X" problems — see `breakEvenRate.ts`).
 *
 * Edge cases:
 *   - requiredAnnualIncome already covered by CPP/OAS alone : no withdrawal, no shortfall.
 *   - total balance <= 0 (and CPP/OAS insufficient)         : nothing to withdraw, shortfall = true.
 *   - draining everything still isn't enough                : drain both accounts, shortfall = true.
 *
 * NOTE: `startRRSP`/`startTFSA` are the START-of-year balances (growth for the
 * year has not been applied yet — see the growth-timing convention).
 */
export function computeRetirementWithdrawal(
  startRRSP: number,
  startTFSA: number,
  requiredAnnualIncome: number,
  cppOasGross: number,
  province: Province,
): RetirementWithdrawalResult {
  const total = startRRSP + startTFSA
  const taxOnCppOas = cppOasGross > 0 ? incomeTaxOwed(cppOasGross, province) : 0
  const cppOasAfterTax = cppOasGross - taxOnCppOas

  // After-tax income (CPP/OAS + savings) at a given withdrawal fraction —
  // monotonically increasing in pct, since the marginal tax rate never
  // reaches 100%.
  function netAtPct(pct: number): number {
    const rrspWithdrawal = pct * startRRSP
    const tfsaWithdrawal = pct * startTFSA
    const taxableIncome = rrspWithdrawal + cppOasGross
    return taxableIncome - incomeTaxOwed(taxableIncome, province) + tfsaWithdrawal
  }

  // Nothing required from savings this year — CPP/OAS alone already cover it.
  if (requiredAnnualIncome <= netAtPct(0)) {
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

  // Not enough saved to meet the need: drain everything available (100%).
  if (requiredAnnualIncome > netAtPct(1)) {
    const taxableIncome = startRRSP + cppOasGross
    const taxPaid = incomeTaxOwed(taxableIncome, province) - taxOnCppOas
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

  // Bisection: hi always meets the need, lo never does.
  let lo = 0
  let hi = 1
  for (let i = 0; i < WITHDRAWAL_MAX_ITERATIONS && hi - lo > WITHDRAWAL_PCT_TOLERANCE; i++) {
    const mid = (lo + hi) / 2
    if (netAtPct(mid) >= requiredAnnualIncome) hi = mid
    else lo = mid
  }

  const withdrawalPct = hi
  const rrspWithdrawal = withdrawalPct * startRRSP
  const tfsaWithdrawal = withdrawalPct * startTFSA
  const taxPaid = incomeTaxOwed(rrspWithdrawal + cppOasGross, province) - taxOnCppOas
  // netFromSavings is taken directly from the bisection's own target rather
  // than rrspWithdrawal - taxPaid + tfsaWithdrawal: at extreme rates/balances
  // those terms can run enormous while their difference stays a modest,
  // everyday number, and floating-point subtraction of two huge near-equal
  // values loses precision fast enough to misfire the shortfall check.
  const netFromSavings = requiredAnnualIncome - cppOasAfterTax

  return {
    rrspWithdrawal,
    tfsaWithdrawal,
    withdrawalPct,
    taxPaid,
    netFromSavings,
    shortfall: false,
  }
}

// ---------------------------------------------------------------------------
// MANDATORY RRIF MINIMUM WITHDRAWAL
// ---------------------------------------------------------------------------
//
// Once a saver turns 72, the CRA forces a minimum withdrawal from a RRIF
// (which we treat the RRSP as becoming) each year, regardless of income need.
// The minimum is a prescribed percentage of the account's START-of-year
// balance that climbs with age. This app starts applying it at 72 (rather
// than the 71 a real RRIF technically uses) to match the age this app has
// always flagged as the "mandatory minimum" boundary.
//
// Source: CRA prescribed RRIF minimum withdrawal factors (Income Tax
// Regulation 7308), current as of the 2015 budget update.
export const MANDATORY_MIN_AGE = 72

const RRIF_MINIMUM_FACTORS: Record<number, number> = {
  72: 0.054,
  73: 0.0553,
  74: 0.0567,
  75: 0.0582,
  76: 0.0598,
  77: 0.0617,
  78: 0.0636,
  79: 0.0658,
  80: 0.0682,
  81: 0.0708,
  82: 0.0738,
  83: 0.0771,
  84: 0.0808,
  85: 0.0851,
  86: 0.0899,
  87: 0.0955,
  88: 0.1021,
  89: 0.1099,
  90: 0.1192,
  91: 0.1306,
  92: 0.1449,
  93: 0.1634,
  94: 0.1879,
}
/** Flat 20% from age 95 on, per the prescribed table. */
const RRIF_MINIMUM_FACTOR_95_PLUS = 0.2

/** The prescribed minimum fraction of the RRSP/RRIF that must be withdrawn this year. 0 before age 72. */
export function rrifMinimumFactor(age: number): number {
  if (age < MANDATORY_MIN_AGE) return 0
  if (age >= 95) return RRIF_MINIMUM_FACTOR_95_PLUS
  return RRIF_MINIMUM_FACTORS[age] ?? RRIF_MINIMUM_FACTOR_95_PLUS
}

export interface RRIFAdjustedWithdrawal extends RetirementWithdrawalResult {
  /** True when the prescribed minimum forced a larger RRSP withdrawal than the plan otherwise needed. */
  forcedMinimum: boolean
  /**
   * The after-tax portion of the forced RRSP withdrawal that couldn't be
   * absorbed by reducing the TFSA withdrawal — money that had to come out of
   * the RRSP but that the plan didn't actually need to spend. 0 unless
   * forcedMinimum is true and the surplus exceeds the whole TFSA withdrawal.
   * Callers decide what to do with it (see `reinvestForcedWithdrawals`).
   */
  surplus: number
}

/**
 * Forces the RRSP withdrawal up to the prescribed minimum when the
 * income-driven withdrawal (`base`) falls short of it. The extra after-tax
 * cash this generates reduces the TFSA withdrawal by the same amount — the
 * saver still needed only the original gap, so money that must now come out
 * of the RRSP is money that no longer needs to come out of the TFSA. If the
 * surplus exceeds the whole TFSA withdrawal, the TFSA share drops to 0 and
 * `netFromSavings` here still counts the whole thing as delivered cash — the
 * `surplus` field reports how much of that was actually unneeded, so
 * `runForecast` can redirect it instead of paying it out, per
 * `reinvestForcedWithdrawals`.
 */
export function applyRRIFMinimum(
  base: RetirementWithdrawalResult,
  startRRSP: number,
  startTFSA: number,
  age: number,
  cppOasGross: number,
  province: Province,
): RRIFAdjustedWithdrawal {
  const minRRSPWithdrawal = startRRSP * rrifMinimumFactor(age)
  if (base.rrspWithdrawal >= minRRSPWithdrawal) {
    return { ...base, forcedMinimum: false, surplus: 0 }
  }

  const rrspWithdrawal = Math.min(minRRSPWithdrawal, startRRSP)

  // The extra after-tax cash from forcing the RRSP withdrawal up is taxed at
  // the marginal rate on top of everything already stacked below it —
  // CPP/OAS, then the plan's own base RRSP withdrawal — not a flat rate on
  // the whole thing.
  const taxOnCppOas = cppOasGross > 0 ? incomeTaxOwed(cppOasGross, province) : 0
  const taxOnBase = incomeTaxOwed(cppOasGross + base.rrspWithdrawal, province)
  const taxOnForced = incomeTaxOwed(cppOasGross + rrspWithdrawal, province)
  const extraAfterTax = (rrspWithdrawal - base.rrspWithdrawal) - (taxOnForced - taxOnBase)

  const tfsaWithdrawal = Math.max(0, base.tfsaWithdrawal - extraAfterTax)
  const surplus = Math.max(0, extraAfterTax - base.tfsaWithdrawal)

  const taxPaid = taxOnForced - taxOnCppOas
  const netFromSavings = rrspWithdrawal - taxPaid + tfsaWithdrawal
  const total = startRRSP + startTFSA
  const withdrawalPct = total > 0 ? (rrspWithdrawal + tfsaWithdrawal) / total : 0

  return {
    rrspWithdrawal,
    tfsaWithdrawal,
    withdrawalPct,
    taxPaid,
    netFromSavings,
    // Forcing a mandatory minimum out of an account that still has money in
    // it isn't a shortfall — that only means the accounts ran out entirely.
    shortfall: base.shortfall,
    forcedMinimum: true,
    surplus,
  }
}

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
 * last segment's untilAge, the last segment applies. Generic over any
 * segment shape with an `untilAge` — used for both the savings plan and the
 * retirement income plan.
 */
export function activeSegmentForAge<T extends { untilAge: number }>(age: number, segments: T[]): T {
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
  const { initial, savingsPlan, retirement, province, rateOfReturn, bestYearReturn, worstYearReturn, seed, endAge } =
    input
  const { currentAge, retirementAge } = initial

  const rows: ForecastYear[] = []

  // One rate per projected year (currentAge..endAge inclusive), sampled once
  // up front so the same seed always reproduces the same sequence regardless
  // of how the two phases below are indexed into it.
  const totalYears = endAge - currentAge + 1
  const rates = yearlyReturns(seed, totalYears, rateOfReturn, worstYearReturn, bestYearReturn)
  const rateForAge = (age: number) => rates[age - currentAge]

  // The saver's income is assumed flat across the accumulation phase, so
  // this marginal rate — the rate the RRSP refund is sized against — only
  // needs computing once.
  const accumulationTaxRate = marginalTaxRate(initial.currentIncome, province)

  let rrsp = initial.currentRRSP
  let tfsa = initial.currentTFSA
  let rrspRoom = initial.currentRRSPRoom
  // Running sum of every applied rate so far, so each row can report its
  // simple average-to-date without re-summing the whole history every year.
  let cumulativeRateSum = 0

  // --- Accumulation: currentAge .. retirementAge - 1 ---------------------
  for (let age = currentAge; age < retirementAge; age++) {
    const segment = activeSegmentForAge(age, savingsPlan)
    const yearRate = rateForAge(age)
    cumulativeRateSum += yearRate
    const averageReturnToDate = cumulativeRateSum / (age - currentAge + 1)
    const startRRSP = rrsp
    const startTFSA = tfsa
    const computed = computeAccumulationYear(startRRSP, startTFSA, segment, accumulationTaxRate, yearRate)

    // A manual override (entered directly in the results table) replaces the
    // segment-derived contribution for this specific age — it stands in for
    // the whole "base contribution + reinvested refund" figure, bypassing
    // the refund math entirely, then grows exactly like any other year.
    const override = input.contributionOverrides[age]
    const rrspContribution = override?.rrspContribution ?? computed.rrspContribution
    const tfsaContribution = override?.tfsaContribution ?? computed.tfsaContribution

    rrsp =
      override?.rrspContribution !== undefined
        ? (startRRSP + rrspContribution) * (1 + yearRate)
        : computed.rrsp
    tfsa =
      override?.tfsaContribution !== undefined
        ? (startTFSA + tfsaContribution) * (1 + yearRate)
        : computed.tfsa

    rrspRoom = rrspRoom + rrspRoomAccrual(initial.currentIncome) - rrspContribution

    rows.push({
      age,
      phase: 'accumulation',
      appliedRateOfReturn: yearRate,
      averageReturnToDate,
      rrsp,
      tfsa,
      total: rrsp + tfsa,
      rrspContribution,
      tfsaContribution,
      rrspWithdrawal: 0,
      tfsaWithdrawal: 0,
      withdrawalPct: 0,
      rrspWithdrawalPct: 0,
      tfsaWithdrawalPct: 0,
      cpp: 0,
      cppAfterTax: 0,
      oas: 0,
      oasAfterTax: 0,
      netFromSavings: 0,
      incomeFromSavingsPct: 0,
      incomeFromCppOasPct: 0,
      taxPaid: 0,
      shortfall: false,
      forcedMinimumWithdrawal: false,
      rrspRoom,
    })
  }

  // --- Retirement: retirementAge .. endAge (inclusive) -------------------
  for (let age = retirementAge; age <= endAge; age++) {
    const yearRate = rateForAge(age)
    cumulativeRateSum += yearRate
    const averageReturnToDate = cumulativeRateSum / (age - currentAge + 1)
    const cpp = cppForAge(age, retirement)
    const oas = oasForAge(age, retirement)
    // CPP/OAS and the RRSP withdrawal are taxed TOGETHER under progressive
    // brackets — CPP/OAS form the "base" layer, taxed as if they were the
    // only income, with the withdrawal stacked on top of them.
    const cppOasGross = cpp + oas
    const taxOnCppOas = cppOasGross > 0 ? incomeTaxOwed(cppOasGross, province) : 0
    const cppOasAfterTax = cppOasGross - taxOnCppOas
    const cppAfterTax = cppOasGross > 0 ? cppOasAfterTax * (cpp / cppOasGross) : 0
    const oasAfterTax = cppOasGross > 0 ? cppOasAfterTax * (oas / cppOasGross) : 0
    const incomeSegment = activeSegmentForAge(age, retirement.incomePlan)
    const requiredAnnualIncome = incomeSegment.requiredMonthlyIncome * 12

    const startRRSP = rrsp
    const startTFSA = tfsa
    const needed = computeRetirementWithdrawal(startRRSP, startTFSA, requiredAnnualIncome, cppOasGross, province)
    const adjusted = applyRRIFMinimum(needed, startRRSP, startTFSA, age, cppOasGross, province)

    // A manual override (entered directly in the results table) replaces the
    // solved-for withdrawal for this specific age, clamped to what's actually
    // available; tax, net cash, and the blended withdrawal % are recomputed
    // to match, exactly as they would be for any other year.
    const override = input.withdrawalOverrides[age]
    const rrspWithdrawal =
      override?.rrspWithdrawal !== undefined
        ? Math.min(Math.max(override.rrspWithdrawal, 0), startRRSP)
        : adjusted.rrspWithdrawal
    const tfsaWithdrawal =
      override?.tfsaWithdrawal !== undefined
        ? Math.min(Math.max(override.tfsaWithdrawal, 0), startTFSA)
        : adjusted.tfsaWithdrawal

    // Money the RRIF minimum forced out of the RRSP that the plan didn't
    // actually need to spend. A manual override for this age represents the
    // saver's explicit intent for the year's flows, so it takes precedence
    // over redirecting anything.
    const overridden = override?.rrspWithdrawal !== undefined || override?.tfsaWithdrawal !== undefined
    const reinvest = !overridden && input.reinvestForcedWithdrawals && adjusted.forcedMinimum
    const reinvestedSurplus = reinvest ? adjusted.surplus : 0

    const taxPaid = incomeTaxOwed(rrspWithdrawal + cppOasGross, province) - taxOnCppOas
    // When reinvesting, use the pre-forcing "needed" net cash directly rather
    // than the full withdrawal minus the surplus: at extreme rates/balances
    // both those terms can run into the quadrillions while their difference
    // is a modest, everyday number, and floating-point subtraction of two
    // huge near-equal values loses precision fast enough to misfire the
    // shortfall check. `needed.netFromSavings` was computed directly at the
    // requirement's own (small) scale, so it's exact where the subtraction isn't.
    const netFromSavings = reinvest
      ? needed.netFromSavings
      : rrspWithdrawal - taxPaid + tfsaWithdrawal
    const startTotal = startRRSP + startTFSA
    const withdrawalPct = startTotal > 0 ? (rrspWithdrawal + tfsaWithdrawal) / startTotal : 0

    // Growth applies AFTER withdrawal (flow first, then grow). Any
    // reinvested surplus flows back in as a TFSA contribution instead of
    // reaching the saver as spendable cash.
    rrsp = (startRRSP - rrspWithdrawal) * (1 + yearRate)
    tfsa = (startTFSA - tfsaWithdrawal + reinvestedSurplus) * (1 + yearRate)

    const totalIncome = netFromSavings + cppAfterTax + oasAfterTax
    // A cent of float slop shouldn't read as a shortfall.
    const shortfall = totalIncome < requiredAnnualIncome - 0.01

    rows.push({
      age,
      phase: 'retirement',
      appliedRateOfReturn: yearRate,
      averageReturnToDate,
      rrsp,
      tfsa,
      total: rrsp + tfsa,
      rrspContribution: 0,
      tfsaContribution: 0,
      rrspWithdrawal,
      tfsaWithdrawal,
      withdrawalPct,
      rrspWithdrawalPct: startRRSP > 0 ? rrspWithdrawal / startRRSP : 0,
      tfsaWithdrawalPct: startTFSA > 0 ? tfsaWithdrawal / startTFSA : 0,
      cpp,
      cppAfterTax,
      oas,
      oasAfterTax,
      netFromSavings,
      incomeFromSavingsPct: totalIncome > 0 ? netFromSavings / totalIncome : 0,
      incomeFromCppOasPct: totalIncome > 0 ? (cppAfterTax + oasAfterTax) / totalIncome : 0,
      taxPaid,
      shortfall,
      forcedMinimumWithdrawal: adjusted.forcedMinimum,
      // No earned income assumed in retirement, so room neither accrues nor
      // is spent — it just carries forward unchanged.
      rrspRoom,
    })
  }

  return rows
}
