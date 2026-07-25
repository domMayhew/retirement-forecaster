// ---------------------------------------------------------------------------
// Canadian personal income tax — federal + provincial marginal brackets.
//
// A deliberately simplified estimate: progressive bracket tax only, with no
// credits, deductions, or exemptions (basic personal amount, donations,
// medical expenses, etc.). Real tax owed is somewhat lower than this
// estimate as a result — this app cares about getting the shape of the
// numbers right (marginal rates, progressive brackets), not exact dollars.
//
// Bracket figures are 2024 tax year, federal + British Columbia + Alberta
// only. Brackets are indexed to inflation annually by the government, so
// these will drift out of date — update the tables below when they do.
// ---------------------------------------------------------------------------

export type Province = 'BC' | 'AB'

/** One bracket: this rate applies to taxable income from the previous bracket's ceiling up to (and including) `upTo`. */
interface TaxBracket {
  upTo: number
  rate: number
}

const FEDERAL_BRACKETS_2024: TaxBracket[] = [
  { upTo: 55867, rate: 0.15 },
  { upTo: 111733, rate: 0.205 },
  { upTo: 173205, rate: 0.26 },
  { upTo: 246752, rate: 0.29 },
  { upTo: Infinity, rate: 0.33 },
]

const PROVINCIAL_BRACKETS_2024: Record<Province, TaxBracket[]> = {
  BC: [
    { upTo: 47937, rate: 0.0506 },
    { upTo: 95875, rate: 0.077 },
    { upTo: 110076, rate: 0.105 },
    { upTo: 133664, rate: 0.1229 },
    { upTo: 181232, rate: 0.147 },
    { upTo: Infinity, rate: 0.168 },
  ],
  AB: [
    { upTo: 148269, rate: 0.10 },
    { upTo: 177922, rate: 0.12 },
    { upTo: 237230, rate: 0.13 },
    { upTo: 355845, rate: 0.14 },
    { upTo: Infinity, rate: 0.15 },
  ],
}

/** Tax owed on `income` under one jurisdiction's bracket table (each bracket's rate applies only to the slice of income within it). */
function bracketTax(income: number, brackets: TaxBracket[]): number {
  if (income <= 0) return 0
  let tax = 0
  let lower = 0
  for (const bracket of brackets) {
    if (income <= lower) break
    const upper = Math.min(income, bracket.upTo)
    tax += (upper - lower) * bracket.rate
    lower = upper
  }
  return tax
}

/** The rate that applies to the NEXT dollar earned at this income level, under one jurisdiction's bracket table. */
function marginalBracketRate(income: number, brackets: TaxBracket[]): number {
  for (const bracket of brackets) {
    if (income <= bracket.upTo) return bracket.rate
  }
  return brackets[brackets.length - 1].rate
}

/** Combined federal + provincial tax owed on `taxableIncome`, brackets only (no credits/deductions). */
export function incomeTaxOwed(taxableIncome: number, province: Province): number {
  return bracketTax(taxableIncome, FEDERAL_BRACKETS_2024) + bracketTax(taxableIncome, PROVINCIAL_BRACKETS_2024[province])
}

/** Combined federal + provincial marginal rate — what the next dollar earned at this income level would be taxed at. */
export function marginalTaxRate(taxableIncome: number, province: Province): number {
  return (
    marginalBracketRate(taxableIncome, FEDERAL_BRACKETS_2024) +
    marginalBracketRate(taxableIncome, PROVINCIAL_BRACKETS_2024[province])
  )
}
