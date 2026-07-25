// SPEC: withDefaults — backfills fields a newer schema added so an older
// saved plan's JSON can't hand the engine anything undefined.

import { describe, it, expect } from 'vitest'
import { withDefaults, DEFAULT_INPUT } from './defaultInput'
import type { ForecastInput } from './engine/types'

describe('withDefaults: retirement income plan migration', () => {
  it('leaves a plan that already has incomePlan untouched', () => {
    const saved: ForecastInput = {
      ...DEFAULT_INPUT,
      retirement: {
        ...DEFAULT_INPUT.retirement,
        incomePlan: [{ id: 'a', requiredMonthlyIncome: 6000, untilAge: 80 }],
      },
    }
    const result = withDefaults(saved)
    expect(result.retirement.incomePlan).toEqual([
      { id: 'a', requiredMonthlyIncome: 6000, untilAge: 80 },
    ])
  })

  it('migrates a legacy flat requiredMonthlyIncome into a single segment covering the whole plan', () => {
    // Simulates JSON saved before the retirement income plan was staged,
    // which predates `incomePlan` in the type — the cast reaches past that.
    const legacy = {
      ...DEFAULT_INPUT,
      endAge: 95,
      retirement: {
        cppMonthly: DEFAULT_INPUT.retirement.cppMonthly,
        cppStartAge: DEFAULT_INPUT.retirement.cppStartAge,
        oasMonthly: DEFAULT_INPUT.retirement.oasMonthly,
        oasStartAge: DEFAULT_INPUT.retirement.oasStartAge,
        retirementTaxRate: DEFAULT_INPUT.retirement.retirementTaxRate,
        requiredMonthlyIncome: 5500,
      },
    } as unknown as ForecastInput

    const result = withDefaults(legacy)
    expect(result.retirement.incomePlan).toEqual([
      { id: 'income-migrated', requiredMonthlyIncome: 5500, untilAge: 95 },
    ])
  })

  it('falls back to the DEFAULT_INPUT income plan when neither incomePlan nor a legacy flat value is present', () => {
    const bare = {
      ...DEFAULT_INPUT,
      retirement: {
        cppMonthly: DEFAULT_INPUT.retirement.cppMonthly,
        cppStartAge: DEFAULT_INPUT.retirement.cppStartAge,
        oasMonthly: DEFAULT_INPUT.retirement.oasMonthly,
        oasStartAge: DEFAULT_INPUT.retirement.oasStartAge,
        retirementTaxRate: DEFAULT_INPUT.retirement.retirementTaxRate,
      },
    } as unknown as ForecastInput

    const result = withDefaults(bare)
    expect(result.retirement.incomePlan).toEqual(DEFAULT_INPUT.retirement.incomePlan)
  })
})
