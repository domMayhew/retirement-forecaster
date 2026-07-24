// ---------------------------------------------------------------------------
// Shared domain model for the retirement forecaster.
//
// This file is the CONTRACT between the calculation engine and the UI.
// Both the engine (test-driven) and the UI depend on these types.
// All monetary amounts are in dollars. All rates are decimals (0.05 = 5%).
// ---------------------------------------------------------------------------

/** Which registered account a contribution or balance belongs to. */
export type AccountType = 'RRSP' | 'TFSA'

/**
 * Initial conditions describing the saver's starting position.
 */
export interface InitialConditions {
  currentAge: number
  currentRRSP: number
  currentTFSA: number
  currentIncome: number
  retirementAge: number
  /** Marginal income tax rate while working. Used to size the RRSP refund. Default 0.25. */
  incomeTaxRate: number
  /**
   * RRSP contribution room available today, as reported on the saver's latest
   * CRA Notice of Assessment (unused room carries forward indefinitely, so
   * this already includes every prior year's carry-forward).
   */
  currentRRSPRoom: number
}

/**
 * A single segment of the accumulation (saving) plan. Segments run in order;
 * each is active from the end of the previous segment up to (and including the
 * year of) `untilAge`. `untilAge` must be strictly greater than the previous
 * segment's `untilAge`.
 */
export interface SavingsPlanSegment {
  id: string
  monthlyRRSP: number
  monthlyTFSA: number
  /** Fraction of the RRSP tax refund reinvested back into the RRSP. Default 1.0. */
  refundReinvestFraction: number
  /** Upper age bound (inclusive) for this segment. Default = retirementAge. */
  untilAge: number
}

/**
 * The retirement (decumulation) plan.
 */
export interface RetirementPlan {
  /** Required take-home income per month, after tax. */
  requiredMonthlyIncome: number
  /** CPP income per month, PRE-TAX. Taxed at retirementTaxRate like RRSP income. */
  cppMonthly: number
  cppStartAge: number
  /** OAS income per month, PRE-TAX. Taxed at retirementTaxRate like RRSP income. */
  oasMonthly: number
  oasStartAge: number
  /** Flat tax rate applied to RRSP withdrawals AND to CPP/OAS in retirement. Default 0.15. */
  retirementTaxRate: number
}

/**
 * A manual override of one or both accumulation-year contributions for a
 * specific age, entered directly in the results table rather than derived
 * from the savings plan's segments. Either field may be set independently.
 */
export interface ContributionOverride {
  rrspContribution?: number
  tfsaContribution?: number
}

/**
 * A manual override of one or both retirement-year withdrawals for a
 * specific age, entered directly in the results table rather than solved
 * for by the withdrawal engine. Either field may be set independently, and
 * each is clamped to the account's start-of-year balance.
 */
export interface WithdrawalOverride {
  rrspWithdrawal?: number
  tfsaWithdrawal?: number
}

/**
 * The full set of user inputs plus global assumptions.
 */
export interface ForecastInput {
  initial: InitialConditions
  savingsPlan: SavingsPlanSegment[]
  retirement: RetirementPlan
  /** Assumed AVERAGE annual rate of return, applied to both RRSP and TFSA. */
  rateOfReturn: number
  /**
   * Upper bound for a given year's return under the variability model —
   * rarely hit exactly, since actual per-year returns taper off toward it.
   * Equal to `rateOfReturn` (the default) means no variability: every year
   * gets the flat average rate.
   */
  bestYearReturn: number
  /** Lower bound for a given year's return under the variability model — see `bestYearReturn`. */
  worstYearReturn: number
  /**
   * Seed for the reproducible pseudo-random sequence of per-year returns.
   * Stable across reloads (so the same plan always replays the same
   * sequence); only "Re-forecast" rolls a new one.
   */
  seed: number
  /** Age the projection runs to (inclusive). Default 100. */
  endAge: number
  /**
   * What happens to RRSP money the mandatory RRIF minimum forced out but the
   * plan didn't actually need to spend. True (default): redirect it into the
   * TFSA, where it keeps compounding tax-free. False: hand it to the saver as
   * extra spending money for that year — untracked beyond inflating that
   * year's net income.
   */
  reinvestForcedWithdrawals: boolean
  /**
   * Per-age manual contribution overrides, keyed by age. Lets a saver hand-edit
   * a specific year's RRSP/TFSA contribution in the results table instead of
   * only through the savings-plan segments. Empty when the plan has no
   * manual edits — i.e. the table is fully "in sync" with the segment inputs.
   */
  contributionOverrides: Record<number, ContributionOverride>
  /**
   * Per-age manual withdrawal overrides, keyed by age. Lets a saver hand-edit
   * a specific retirement year's RRSP/TFSA withdrawal instead of only through
   * the solved-for income need. Empty when the plan has no manual edits.
   */
  withdrawalOverrides: Record<number, WithdrawalOverride>
}

/**
 * One row of the projected output — a snapshot at a given age.
 * Balances are end-of-year (after that year's contributions/withdrawals/growth).
 */
export interface ForecastYear {
  age: number
  phase: 'accumulation' | 'retirement'
  /** The actual rate of return applied to grow this year's balance — the flat `rateOfReturn` unless variability is in play, in which case it's this year's sampled value. */
  appliedRateOfReturn: number

  // End-of-year balances.
  rrsp: number
  tfsa: number
  total: number

  // Flows during the year (positive = into account, negative = out).
  rrspContribution: number
  tfsaContribution: number
  rrspWithdrawal: number
  tfsaWithdrawal: number
  /**
   * The percentage withdrawn from the combined RRSP+TFSA balance this year.
   * 0 when no withdrawal was needed.
   */
  withdrawalPct: number
  /** Fraction of the START-of-year RRSP balance withdrawn this year. 0 if the RRSP was empty. */
  rrspWithdrawalPct: number
  /** Fraction of the START-of-year TFSA balance withdrawn this year. 0 if the TFSA was empty. */
  tfsaWithdrawalPct: number

  // Retirement income breakdown (0 during accumulation).
  /** Gross (pre-tax) annual CPP income received this year. */
  cpp: number
  /** After-tax CPP income (cpp * (1 - retirementTaxRate)). */
  cppAfterTax: number
  /** Gross (pre-tax) annual OAS income received this year. */
  oas: number
  /** After-tax OAS income (oas * (1 - retirementTaxRate)). */
  oasAfterTax: number
  /** After-tax cash actually delivered to the saver from account withdrawals. */
  netFromSavings: number
  /**
   * Fraction of this year's total after-tax retirement income that came from
   * savings withdrawals rather than CPP/OAS. 0 during accumulation and in any
   * retirement year with no income at all.
   */
  incomeFromSavingsPct: number
  /** Fraction of this year's total after-tax retirement income that came from CPP + OAS. */
  incomeFromCppOasPct: number
  /** Tax paid on RRSP withdrawals this year (does not include CPP/OAS tax). */
  taxPaid: number
  /**
   * True when accounts were exhausted and the required income could not be
   * fully met this year.
   */
  shortfall: boolean
  /**
   * True when the prescribed RRIF minimum (from age 72 on) forced a bigger
   * RRSP withdrawal than the plan otherwise needed this year.
   */
  forcedMinimumWithdrawal: boolean

  /**
   * Remaining RRSP contribution room at the end of this year: last year's
   * room, plus this year's accrual (18% of current income, capped at the
   * annual CRA dollar limit — accumulation years only), minus this year's
   * RRSP contribution. Negative means the plan contributes more than the
   * saver is allowed to.
   */
  rrspRoom: number
}

export type Forecast = ForecastYear[]
