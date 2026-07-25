// Shared starter values and schema-defaulting, used both by the main app
// (for its initial/startup state) and by the comparison feature (to safely
// load any saved plan regardless of which app version saved it).
import type { ForecastInput, RetirementPlan } from './engine/types'
import { randomSeed } from './engine/variability'

// Sensible defaults so the app shows something immediately on load.
export const DEFAULT_INPUT: ForecastInput = {
  initial: {
    currentAge: 35,
    currentRRSP: 50000,
    currentTFSA: 30000,
    currentIncome: 90000,
    retirementAge: 65,
    currentRRSPRoom: 40000,
  },
  province: 'BC',
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
    incomePlan: [
      {
        id: 'income-initial',
        requiredMonthlyIncome: 4000,
        untilAge: 100,
      },
    ],
    cppMonthly: 1000,
    cppStartAge: 65,
    oasMonthly: 700,
    oasStartAge: 65,
  },
  rateOfReturn: 0.05,
  bestYearReturn: 0.05,
  worstYearReturn: 0.05,
  seed: 1,
  endAge: 100,
  reinvestForcedWithdrawals: true,
  contributionOverrides: {},
  withdrawalOverrides: {},
}

// Defends against saved plans from an earlier version of the app that are
// missing fields a newer schema added, so loading one can't hand the engine
// undefined numbers.
export function withDefaults(saved: ForecastInput): ForecastInput {
  // A plan saved before the retirement income plan was staged has a flat
  // `requiredMonthlyIncome` instead of `incomePlan` — this predates the
  // field in the type, so the cast reaches past it for the migration check.
  const savedRetirement = saved.retirement as unknown as Partial<RetirementPlan> & {
    requiredMonthlyIncome?: number
  }
  const incomePlan =
    savedRetirement?.incomePlan ??
    (savedRetirement?.requiredMonthlyIncome !== undefined
      ? [
          {
            id: 'income-migrated',
            requiredMonthlyIncome: savedRetirement.requiredMonthlyIncome,
            untilAge: saved.endAge ?? DEFAULT_INPUT.endAge,
          },
        ]
      : DEFAULT_INPUT.retirement.incomePlan)

  return {
    ...DEFAULT_INPUT,
    ...saved,
    initial: { ...DEFAULT_INPUT.initial, ...saved.initial },
    retirement: { ...DEFAULT_INPUT.retirement, ...saved.retirement, incomePlan },
    // A plan saved before variability existed has no seed of its own — give
    // it a fresh random one rather than always replaying DEFAULT_INPUT's.
    // Once the plan is saved again, that seed sticks like any other field.
    seed: saved.seed ?? randomSeed(),
  }
}
