// SPEC: findMinimumSurvivingRate — binary search for the minimum assumed
// rate of return needed for a plan's savings to last through endAge.

import { describe, it, expect } from 'vitest'
import {
  findMinimumSurvivingRate,
  survivesThroughEndAge,
  MIN_RATE_SEARCH_LOWER,
  MIN_RATE_SEARCH_UPPER,
} from './breakEvenRate'
import type { ForecastInput, SavingsPlanSegment } from './types'

function seg(over: Partial<SavingsPlanSegment> = {}): SavingsPlanSegment {
  return {
    id: 's1',
    monthlyRRSP: 0,
    monthlyTFSA: 0,
    refundReinvestFraction: 1.0,
    untilAge: 65,
    ...over,
  }
}

function baseInput(over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    initial: {
      currentAge: 65,
      currentRRSP: 0,
      currentTFSA: 0,
      currentIncome: 0,
      retirementAge: 65,
      incomeTaxRate: 0.25,
      currentRRSPRoom: 0,
    },
    savingsPlan: [seg()],
    retirement: {
      requiredMonthlyIncome: 2000,
      cppMonthly: 0,
      cppStartAge: 200,
      oasMonthly: 0,
      oasStartAge: 200,
      retirementTaxRate: 0.15,
    },
    rateOfReturn: 0.05,
    endAge: 90,
    contributionOverrides: {},
    withdrawalOverrides: {},
    ...over,
  }
}

describe('findMinimumSurvivingRate: a plan with far more savings than it needs', () => {
  it('reports alwaysSurvives, since even the lowest searched rate is enough', () => {
    const input = baseInput({
      initial: {
        currentAge: 65,
        currentRRSP: 10000000,
        currentTFSA: 0,
        currentIncome: 0,
        retirementAge: 65,
        incomeTaxRate: 0.25,
        currentRRSPRoom: 0,
      },
      endAge: 70,
    })
    const result = findMinimumSurvivingRate(input)
    expect(result.alwaysSurvives).toBe(true)
    expect(result.neverSurvives).toBe(false)
    expect(result.rate).toBe(MIN_RATE_SEARCH_LOWER)
  })
})

describe('findMinimumSurvivingRate: a plan with no savings and no income to draw from', () => {
  it('reports neverSurvives, since even the highest searched rate cannot help', () => {
    // 0 balance, no contributions (retires immediately), a real income need:
    // there is nothing for any rate of return to compound.
    const input = baseInput()
    const result = findMinimumSurvivingRate(input)
    expect(result.neverSurvives).toBe(true)
    expect(result.alwaysSurvives).toBe(false)
    expect(result.rate).toBe(MIN_RATE_SEARCH_UPPER)
  })
})

describe('findMinimumSurvivingRate: a plan whose outcome genuinely depends on the rate', () => {
  it('finds a rate strictly inside the search bounds that is really the threshold', () => {
    const input = baseInput({
      initial: {
        currentAge: 65,
        currentRRSP: 200000,
        currentTFSA: 0,
        currentIncome: 0,
        retirementAge: 65,
        incomeTaxRate: 0.25,
        currentRRSPRoom: 0,
      },
      endAge: 90,
    })
    const result = findMinimumSurvivingRate(input)
    expect(result.alwaysSurvives).toBe(false)
    expect(result.neverSurvives).toBe(false)
    expect(result.rate).toBeGreaterThan(MIN_RATE_SEARCH_LOWER)
    expect(result.rate).toBeLessThan(MIN_RATE_SEARCH_UPPER)

    // The found rate survives; comfortably below it, the plan should not —
    // confirming this is really the threshold, not an arbitrary point.
    expect(survivesThroughEndAge(input, result.rate)).toBe(true)
    expect(survivesThroughEndAge(input, result.rate - 0.02)).toBe(false)
  })
})

describe('survivesThroughEndAge', () => {
  it('is false whenever any year falls short of the required income', () => {
    const input = baseInput()
    expect(survivesThroughEndAge(input, 0)).toBe(false)
  })

  it('is true for a plan that comfortably meets its income needs throughout', () => {
    const input = baseInput({
      initial: {
        currentAge: 65,
        currentRRSP: 10000000,
        currentTFSA: 0,
        currentIncome: 0,
        retirementAge: 65,
        incomeTaxRate: 0.25,
        currentRRSPRoom: 0,
      },
      endAge: 70,
    })
    expect(survivesThroughEndAge(input, 0.05)).toBe(true)
  })
})
