// Shared starter values and schema-defaulting, used both by the main app
// (for its initial/startup state) and by the comparison feature (to safely
// load any saved plan regardless of which app version saved it).
import type { ForecastInput } from './engine/types'

// Sensible defaults so the app shows something immediately on load.
export const DEFAULT_INPUT: ForecastInput = {
  initial: {
    currentAge: 35,
    currentRRSP: 50000,
    currentTFSA: 30000,
    currentIncome: 90000,
    retirementAge: 65,
    incomeTaxRate: 0.25,
    currentRRSPRoom: 40000,
  },
  savingsPlan: [
    {
      id: 'seg-initial',
      monthlyRRSP: 500,
      monthlyTFSA: 500,
      refundReinvestFraction: 1,
      untilAge: 65,
    },
  ],
  retirement: {
    requiredMonthlyIncome: 4000,
    cppMonthly: 1000,
    cppStartAge: 65,
    oasMonthly: 700,
    oasStartAge: 65,
    retirementTaxRate: 0.15,
  },
  rateOfReturn: 0.05,
  endAge: 100,
  reinvestForcedWithdrawals: true,
  contributionOverrides: {},
  withdrawalOverrides: {},
}

// Defends against saved plans from an earlier version of the app that are
// missing fields a newer schema added, so loading one can't hand the engine
// undefined numbers.
export function withDefaults(saved: ForecastInput): ForecastInput {
  return {
    ...DEFAULT_INPUT,
    ...saved,
    initial: { ...DEFAULT_INPUT.initial, ...saved.initial },
    retirement: { ...DEFAULT_INPUT.retirement, ...saved.retirement },
  }
}
