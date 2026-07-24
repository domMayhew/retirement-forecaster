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
 * The full set of user inputs plus global assumptions.
 */
export interface ForecastInput {
  initial: InitialConditions
  savingsPlan: SavingsPlanSegment[]
  retirement: RetirementPlan
  /** Assumed annual rate of return, applied to both RRSP and TFSA. */
  rateOfReturn: number
  /** Age the projection runs to (inclusive). Default 100. */
  endAge: number
}

/**
 * One row of the projected output — a snapshot at a given age.
 * Balances are end-of-year (after that year's contributions/withdrawals/growth).
 */
export interface ForecastYear {
  age: number
  phase: 'accumulation' | 'retirement'

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
   * The percentage withdrawn from each account this year (same % from RRSP and
   * TFSA). 0 when no withdrawal was needed. Surfaced so the eventual mandatory
   * age-72 rule (which forces at least 5% of the RRSP) is easy to preview:
   * years below 5% are where that rule would force extra withdrawals.
   */
  withdrawalPct: number

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
  /** Tax paid on RRSP withdrawals this year (does not include CPP/OAS tax). */
  taxPaid: number
  /**
   * True when accounts were exhausted and the required income could not be
   * fully met this year.
   */
  shortfall: boolean

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
