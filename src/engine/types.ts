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
  /** Annual CPP income (entered as after-tax). */
  cppAnnual: number
  cppStartAge: number
  /** Annual OAS income (entered as after-tax). */
  oasAnnual: number
  oasStartAge: number
  /** Flat tax rate applied to RRSP withdrawals in retirement. Default 0.15. */
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

  // Retirement income breakdown (0 during accumulation).
  cpp: number
  oas: number
  /** After-tax cash actually delivered to the saver from account withdrawals. */
  netFromSavings: number
  /** Tax paid on RRSP withdrawals this year. */
  taxPaid: number
  /**
   * True when accounts were exhausted and the required income could not be
   * fully met this year.
   */
  shortfall: boolean
}

export type Forecast = ForecastYear[]
