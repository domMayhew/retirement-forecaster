// SPEC: runForecast — stitches accumulation + retirement into a full projection.
//
// PHASE BOUNDARIES (documented convention):
//   accumulation : ages [currentAge, retirementAge)   — up to retirementAge - 1
//   retirement   : ages [retirementAge, endAge]        — inclusive of endAge
//
// Growth-timing convention throughout: "flow first, then grow."

import { describe, it, expect } from 'vitest'
import { runForecast, RRSP_ANNUAL_DOLLAR_LIMIT } from './forecast'
import { yearlyReturns } from './variability'
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

// A fully hand-checkable scenario:
//   - Age 64 is the single accumulation year (retirementAge 65).
//   - No contributions, so accumulation is pure 10% growth of $100k + $100k.
//   - Retirement years 65 and 66 each need $44,985/yr from a 50/50 split.
//     Province BC keeps the withdrawal within the first federal (15%) AND
//     first BC (5.06%) bracket — combined 20.06% — so the progressive-bracket
//     math this scenario actually exercises still reduces to simple flat-rate
//     algebra, and $44,985 (rather than a round $45,000) is exactly the net
//     that a clean 25k/25k RRSP/TFSA withdrawal produces at that rate.
//
//   Accumulation age 64: (100,000) * 1.10 = 110,000 in each account.
//   Retirement age 65: total 220,000; gross withdrawal 50,000 (25k + 25k);
//                      tax 5,015 (25,000 * 20.06%); net 44,985;
//                      then grow: 85,000 * 1.10 = 93,500 each.
//   Retirement age 66: total 187,000; again 25k + 25k out, net 44,985
//                      (same target, same 50/50 RRSP:TFSA ratio -> same
//                      solved withdrawal regardless of the smaller total);
//                      then grow: 68,500 * 1.10 = 75,350 each.
function baseInput(): ForecastInput {
  return {
    initial: {
      currentAge: 64,
      currentRRSP: 100000,
      currentTFSA: 100000,
      currentIncome: 0,
      retirementAge: 65,
      currentRRSPRoom: 200000,
    },
    province: 'BC',
    savingsPlan: [seg({ untilAge: 65 })],
    retirement: {
      incomePlan: [{ id: 'income-1', requiredMonthlyIncome: 44985 / 12, untilAge: 66 }],
      cppMonthly: 0,
      cppStartAge: 200, // effectively never
      oasMonthly: 0,
      oasStartAge: 200, // effectively never
    },
    rateOfReturn: 0.10,
    bestYearReturn: 0.10,
    worstYearReturn: 0.10,
    seed: 1,
    endAge: 66,
    reinvestForcedWithdrawals: true,
    contributionOverrides: {},
    withdrawalOverrides: {},
  }
}

describe('runForecast: phase layout and coverage', () => {
  it('produces one row per age from currentAge through endAge inclusive', () => {
    const rows = runForecast(baseInput())
    expect(rows.map((r) => r.age)).toEqual([64, 65, 66])
  })

  it('labels ages before retirementAge as accumulation and the rest as retirement', () => {
    const rows = runForecast(baseInput())
    expect(rows.find((r) => r.age === 64)!.phase).toBe('accumulation')
    expect(rows.find((r) => r.age === 65)!.phase).toBe('retirement')
    expect(rows.find((r) => r.age === 66)!.phase).toBe('retirement')
  })
})

describe('runForecast: the accumulation year grows the opening balances', () => {
  it('grows $100k in each account by 10% to $110k at age 64', () => {
    const rows = runForecast(baseInput())
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.rrsp).toBeCloseTo(110000, 6)
    expect(y64.tfsa).toBeCloseTo(110000, 6)
    expect(y64.total).toBeCloseTo(220000, 6)
  })
})

describe('runForecast: manual contribution overrides replace the segment-derived amount for that age', () => {
  it('overrides just the RRSP contribution, leaving TFSA computed normally', () => {
    // Age 64 is the only accumulation year. Base plan contributes 0 to
    // both; override RRSP to 10,000 -> (100,000 + 10,000) * 1.10 = 121,000.
    // TFSA is untouched: (100,000 + 0) * 1.10 = 110,000, same as the base case.
    const input = baseInput()
    input.contributionOverrides = { 64: { rrspContribution: 10000 } }
    const rows = runForecast(input)
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.rrspContribution).toBe(10000)
    expect(y64.rrsp).toBeCloseTo(121000, 6)
    expect(y64.tfsaContribution).toBe(0)
    expect(y64.tfsa).toBeCloseTo(110000, 6)
  })

  it('overrides just the TFSA contribution, leaving RRSP computed normally', () => {
    const input = baseInput()
    input.contributionOverrides = { 64: { tfsaContribution: 5000 } }
    const rows = runForecast(input)
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.tfsaContribution).toBe(5000)
    expect(y64.tfsa).toBeCloseTo((100000 + 5000) * 1.1, 6)
    expect(y64.rrspContribution).toBe(0)
    expect(y64.rrsp).toBeCloseTo(110000, 6)
  })

  it('overrides both accounts at once', () => {
    const input = baseInput()
    input.contributionOverrides = { 64: { rrspContribution: 2000, tfsaContribution: 3000 } }
    const rows = runForecast(input)
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.rrsp).toBeCloseTo((100000 + 2000) * 1.1, 6)
    expect(y64.tfsa).toBeCloseTo((100000 + 3000) * 1.1, 6)
  })

  it('an override for an age that never occurs in the plan has no effect', () => {
    const input = baseInput()
    input.contributionOverrides = { 30: { rrspContribution: 999999 } }
    const rows = runForecast(input)
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.rrsp).toBeCloseTo(110000, 6)
  })

  it('spends the overridden contribution against RRSP room, not the segment-derived one', () => {
    const input = baseInput()
    input.initial.currentRRSPRoom = 5000
    input.initial.currentIncome = 0 // no accrual
    input.contributionOverrides = { 64: { rrspContribution: 3000 } }
    const rows = runForecast(input)
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.rrspRoom).toBeCloseTo(5000 - 3000, 6)
  })
})

describe('runForecast: retirement years deliver the required income and update balances', () => {
  it('at age 65 withdraws 25k+25k, pays 20.06% tax, nets the 44,985 requirement, then grows to 93.5k each', () => {
    const rows = runForecast(baseInput())
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.rrspWithdrawal).toBeCloseTo(25000, 4)
    expect(y65.tfsaWithdrawal).toBeCloseTo(25000, 4)
    expect(y65.taxPaid).toBeCloseTo(5015, 4)
    expect(y65.netFromSavings).toBeCloseTo(44985, 4)
    expect(y65.rrsp).toBeCloseTo(93500, 3)
    expect(y65.tfsa).toBeCloseTo(93500, 3)
    expect(y65.shortfall).toBe(false)
  })

  it('at age 66 again nets the 44,985 requirement and grows the remainder to 75,350 each', () => {
    const rows = runForecast(baseInput())
    const y66 = rows.find((r) => r.age === 66)!
    expect(y66.netFromSavings).toBeCloseTo(44985, 4)
    expect(y66.rrsp).toBeCloseTo(75350, 3)
    expect(y66.tfsa).toBeCloseTo(75350, 3)
  })
})

describe('runForecast: manual withdrawal overrides replace the solved-for amount for that age', () => {
  it('overrides just the RRSP withdrawal, recomputing tax/net and flagging the shortfall this creates', () => {
    // Age 65 naturally withdraws 25k/25k for a 45k net. Override RRSP down
    // to 10,000: tax = 2,006 (10,000 * 20.06%), net = 10,000 - 2,006 + 25,000
    // (TFSA untouched, still the naturally solved amount) = 32,994 — under
    // the ~45k need.
    const input = baseInput()
    input.withdrawalOverrides = { 65: { rrspWithdrawal: 10000 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.rrspWithdrawal).toBe(10000)
    expect(y65.taxPaid).toBeCloseTo(2006, 4)
    expect(y65.tfsaWithdrawal).toBeCloseTo(25000, 4)
    expect(y65.netFromSavings).toBeCloseTo(32994, 4)
    expect(y65.shortfall).toBe(true)
    expect(y65.rrsp).toBeCloseTo((110000 - 10000) * 1.1, 6)
    expect(y65.tfsa).toBeCloseTo((110000 - 25000) * 1.1, 4)
  })

  it('overrides just the TFSA withdrawal, leaving RRSP solved normally', () => {
    const input = baseInput()
    input.withdrawalOverrides = { 65: { tfsaWithdrawal: 10000 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.tfsaWithdrawal).toBe(10000)
    expect(y65.rrspWithdrawal).toBeCloseTo(25000, 4)
    expect(y65.netFromSavings).toBeCloseTo(25000 - 5015 + 10000, 4)
    expect(y65.shortfall).toBe(true)
  })

  it('overrides both accounts at once', () => {
    const input = baseInput()
    input.withdrawalOverrides = { 65: { rrspWithdrawal: 5000, tfsaWithdrawal: 5000 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.taxPaid).toBeCloseTo(1003, 4)
    expect(y65.netFromSavings).toBeCloseTo(8997, 4)
    expect(y65.rrsp).toBeCloseTo((110000 - 5000) * 1.1, 6)
    expect(y65.tfsa).toBeCloseTo((110000 - 5000) * 1.1, 6)
  })

  it('clamps an override to the start-of-year balance rather than going negative', () => {
    const input = baseInput()
    input.withdrawalOverrides = { 65: { rrspWithdrawal: 999999999 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.rrspWithdrawal).toBeCloseTo(110000, 6)
    expect(y65.rrsp).toBeCloseTo(0, 6)
  })

  it('does not clear the RRIF-forced-minimum flag just because the override ignores it', () => {
    // Same scenario as the RRIF-minimum test: age 72, huge RRSP, tiny income
    // need, so the mandatory minimum would normally force ~5.4% out. An
    // override that disregards that minimum still shows what actually
    // happened (the tiny override amount) while forcedMinimumWithdrawal
    // keeps reporting that the underlying rule was in play this year.
    const input = baseInput()
    input.initial.currentAge = 71
    input.initial.retirementAge = 72
    input.initial.currentRRSP = 500000
    input.initial.currentTFSA = 500000
    input.retirement.incomePlan = [{ id: 'income-1', requiredMonthlyIncome: 100, untilAge: 72 }]
    input.endAge = 72
    input.withdrawalOverrides = { 72: { rrspWithdrawal: 100 } }
    const rows = runForecast(input)
    const y72 = rows.find((r) => r.age === 72)!
    expect(y72.rrspWithdrawal).toBe(100)
    expect(y72.forcedMinimumWithdrawal).toBe(true)
  })
})

describe('runForecast: CPP/OAS are pre-tax and reduce the amount drawn from savings', () => {
  it('applies real marginal tax to CPP, so only its AFTER-TAX value shrinks the gap', () => {
    // $1,250/mo CPP -> $15,000/yr gross, taxed alone (nothing stacked on top
    // yet) at BC's combined first-bracket rate: 15,000 * 20.06% = 3,009 tax,
    // so after-tax CPP is 11,991. The ~44,985 need therefore leaves a
    // ~32,994 gap that savings must net.
    const input = baseInput()
    input.retirement.cppMonthly = 1250
    input.retirement.cppStartAge = 65
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.cpp).toBe(15000) // gross annual
    expect(y65.cppAfterTax).toBeCloseTo(11991, 6)
    expect(y65.netFromSavings).toBeCloseTo(32994, 4)
  })
})

describe('runForecast: per-account withdrawal % and income mix', () => {
  it('splits the same percentage from RRSP and TFSA when no minimum forces otherwise', () => {
    // From the base scenario: age 65 starts at 110,000/110,000, withdraws
    // 25,000/25,000 -> 22.7272...% of each account, matching the blended
    // withdrawalPct exactly since the split is 50/50.
    const rows = runForecast(baseInput())
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.rrspWithdrawalPct).toBeCloseTo(y65.withdrawalPct, 9)
    expect(y65.tfsaWithdrawalPct).toBeCloseTo(y65.withdrawalPct, 9)
    expect(y65.rrspWithdrawalPct).toBeCloseTo(25000 / 110000, 9)
  })

  it('is 0/0 during accumulation (nothing withdrawn yet)', () => {
    const rows = runForecast(baseInput())
    const y64 = rows.find((r) => r.age === 64)!
    expect(y64.rrspWithdrawalPct).toBe(0)
    expect(y64.tfsaWithdrawalPct).toBe(0)
    expect(y64.incomeFromSavingsPct).toBe(0)
    expect(y64.incomeFromCppOasPct).toBe(0)
  })

  it('attributes 100% of income to savings when there is no CPP/OAS', () => {
    const rows = runForecast(baseInput())
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.incomeFromSavingsPct).toBeCloseTo(1, 9)
    expect(y65.incomeFromCppOasPct).toBeCloseTo(0, 9)
  })

  it('splits income mix between savings and CPP/OAS proportionally', () => {
    // $11,991 after-tax CPP against the ~$44,985 need -> ~32,994 from savings.
    // Income mix: 32,994/44,985 from savings, 11,991/44,985 from CPP.
    const input = baseInput()
    input.retirement.cppMonthly = 1250
    input.retirement.cppStartAge = 65
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.incomeFromSavingsPct).toBeCloseTo(32994 / 44985, 6)
    expect(y65.incomeFromCppOasPct).toBeCloseTo(11991 / 44985, 6)
    expect(y65.incomeFromSavingsPct + y65.incomeFromCppOasPct).toBeCloseTo(1, 9)
  })
})

describe('runForecast: ordered savings-plan segments switch at their untilAge', () => {
  it('applies segment 1 through its untilAge, then segment 2 for later years', () => {
    // Ages 40,41,42 are accumulation, and rateOfReturn 0 so each contribution
    // lands 1:1. currentIncome is 0, but the marginal rate on a $0 income is
    // still the lowest bracket (20.06% combined federal+BC) — the refund
    // mechanic doesn't special-case "no income," so every contribution here
    // reinvests a 20.06% refund on top of the base amount.
    //   seg1 (until 41): $1,000/mo -> 12,000/yr base + 2,407.20 refund
    //     = 14,407.20/yr -> applies to ages 40, 41
    //   seg2 (until 43): $2,000/mo -> 24,000/yr base + 4,814.40 refund
    //     = 28,814.40/yr -> applies to age 42
    //   RRSP: 14,407.20 -> 28,814.40 -> 57,628.80
    const input: ForecastInput = {
      initial: {
        currentAge: 40,
        currentRRSP: 0,
        currentTFSA: 0,
        currentIncome: 0,
        retirementAge: 43,
        currentRRSPRoom: 200000,
      },
      province: 'BC',
      savingsPlan: [
        seg({ id: 'a', monthlyRRSP: 1000, untilAge: 41 }),
        seg({ id: 'b', monthlyRRSP: 2000, untilAge: 43 }),
      ],
      retirement: {
        incomePlan: [{ id: 'income-1', requiredMonthlyIncome: 0, untilAge: 43 }],
        cppMonthly: 0,
        cppStartAge: 200,
        oasMonthly: 0,
        oasStartAge: 200,
      },
      rateOfReturn: 0,
      bestYearReturn: 0,
      worstYearReturn: 0,
      seed: 1,
      endAge: 43,
      reinvestForcedWithdrawals: true,
      contributionOverrides: {},
      withdrawalOverrides: {},
    }
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 40)!.rrsp).toBeCloseTo(14407.2, 6)
    expect(rows.find((r) => r.age === 41)!.rrsp).toBeCloseTo(28814.4, 6)
    expect(rows.find((r) => r.age === 42)!.rrsp).toBeCloseTo(57628.8, 6)
  })
})

describe('runForecast: staged retirement income plan switches at each segment\'s untilAge', () => {
  it('applies stage 1 required income through its untilAge, then stage 2 for later years', () => {
    // A big enough RRSP that nothing runs short, 0% growth/tax so the
    // numbers are hand-checkable: stage 1 needs 60,000/yr through age 67
    // (the "go-go" years), stage 2 tapers to 24,000/yr for 68-70.
    const input: ForecastInput = {
      initial: {
        currentAge: 64,
        currentRRSP: 1000000,
        currentTFSA: 0,
        currentIncome: 0,
        retirementAge: 65,
        currentRRSPRoom: 0,
      },
      province: 'BC',
      savingsPlan: [seg({ untilAge: 65 })],
      retirement: {
        incomePlan: [
          { id: 'stage-1', requiredMonthlyIncome: 5000, untilAge: 67 },
          { id: 'stage-2', requiredMonthlyIncome: 2000, untilAge: 70 },
        ],
        cppMonthly: 0,
        cppStartAge: 200,
        oasMonthly: 0,
        oasStartAge: 200,
      },
      rateOfReturn: 0,
      bestYearReturn: 0,
      worstYearReturn: 0,
      seed: 1,
      endAge: 70,
      reinvestForcedWithdrawals: true,
      contributionOverrides: {},
      withdrawalOverrides: {},
    }
    const rows = runForecast(input)
    for (const age of [65, 66, 67]) {
      expect(rows.find((r) => r.age === age)!.netFromSavings).toBeCloseTo(60000, 3)
    }
    for (const age of [68, 69, 70]) {
      expect(rows.find((r) => r.age === age)!.netFromSavings).toBeCloseTo(24000, 3)
    }
  })

  it('falls back to the last segment for ages beyond its own untilAge', () => {
    // A single stage only explicitly covers through age 67, but the
    // projection runs to 70 — activeSegmentForAge's fallback rule means it
    // still applies for 68-70 rather than leaving those years undefined. A
    // large enough balance that it isn't drained by then keeps this test
    // isolated to the fallback behavior, not depletion.
    const input = baseInput()
    input.initial.currentRRSP = 5000000
    input.initial.currentTFSA = 5000000
    input.endAge = 70
    input.retirement.incomePlan = [{ id: 'stage-1', requiredMonthlyIncome: 3750, untilAge: 67 }]
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 70)!.netFromSavings).toBeCloseTo(45000, 3)
  })

  it('a shorter early stage can require MORE income than a later stage, not just less', () => {
    const input = baseInput()
    input.endAge = 67
    input.retirement.incomePlan = [
      { id: 'stage-1', requiredMonthlyIncome: 3750, untilAge: 65 }, // 45,000/yr
      { id: 'stage-2', requiredMonthlyIncome: 1000, untilAge: 67 }, // 12,000/yr
    ]
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 65)!.netFromSavings).toBeCloseTo(45000, 4)
    expect(rows.find((r) => r.age === 66)!.netFromSavings).toBeCloseTo(12000, 4)
    expect(rows.find((r) => r.age === 67)!.netFromSavings).toBeCloseTo(12000, 4)
  })
})

describe('runForecast: running out of money flags a shortfall', () => {
  it('marks shortfall = true once the accounts are exhausted', () => {
    const input = baseInput()
    // Require far more than the modest balances can sustain.
    input.retirement.incomePlan = [{ id: 'income-1', requiredMonthlyIncome: 100000, untilAge: 70 }] // 1.2M/yr
    input.endAge = 70
    const rows = runForecast(input)
    const retirementRows = rows.filter((r) => r.phase === 'retirement')
    expect(retirementRows.some((r) => r.shortfall)).toBe(true)
  })
})

describe('runForecast: mandatory RRIF minimum forces extra RRSP withdrawal from age 72', () => {
  it('flags forcedMinimumWithdrawal and withdraws exactly the prescribed % when the income need is tiny', () => {
    const input = baseInput()
    input.initial.currentAge = 71
    input.initial.retirementAge = 72
    input.initial.currentRRSP = 500000
    input.initial.currentTFSA = 500000
    input.retirement.incomePlan = [{ id: 'income-1', requiredMonthlyIncome: 100, untilAge: 72 }] // far below the mandatory minimum
    input.endAge = 72
    const rows = runForecast(input)
    const y72 = rows.find((r) => r.age === 72)!
    expect(y72.forcedMinimumWithdrawal).toBe(true)
    expect(y72.rrspWithdrawalPct).toBeCloseTo(0.054, 6)
  })

  it('never forces a withdrawal before age 72', () => {
    const rows = runForecast(baseInput())
    expect(rows.every((r) => !r.forcedMinimumWithdrawal)).toBe(true)
  })
})

describe('runForecast: reinvestForcedWithdrawals decides where an unneeded forced RRSP withdrawal goes', () => {
  // A single retirement year at 95 (flat 20% RRIF minimum), with a huge RRSP,
  // a nearly-empty TFSA, and a tiny income need — the mandatory minimum forces
  // far more out of the RRSP than the plan needs to spend. rateOfReturn: 0
  // keeps the numbers exact so the two settings can be compared precisely.
  function forcedSurplusInput(reinvestForcedWithdrawals: boolean): ForecastInput {
    return {
      initial: {
        currentAge: 95,
        currentRRSP: 1000000,
        currentTFSA: 5000,
        currentIncome: 0,
        retirementAge: 95,
        currentRRSPRoom: 0,
      },
      province: 'BC',
      savingsPlan: [seg({ untilAge: 95 })],
      retirement: {
        incomePlan: [{ id: 'income-1', requiredMonthlyIncome: 1000 / 12, untilAge: 95 }],
        cppMonthly: 0,
        cppStartAge: 200,
        oasMonthly: 0,
        oasStartAge: 200,
      },
      rateOfReturn: 0,
      bestYearReturn: 0,
      worstYearReturn: 0,
      seed: 1,
      endAge: 95,
      reinvestForcedWithdrawals,
      contributionOverrides: {},
      withdrawalOverrides: {},
    }
  }

  it('by default, redirects the unneeded surplus into the TFSA instead of paying it out', () => {
    const rows = runForecast(forcedSurplusInput(true))
    const y95 = rows.find((r) => r.age === 95)!
    expect(y95.forcedMinimumWithdrawal).toBe(true)
    // The saver nets only what they needed — the surplus didn't inflate income.
    expect(y95.netFromSavings).toBeCloseTo(1000, 2)
    expect(y95.shortfall).toBe(false)
    // ...and the rest landed in the TFSA instead (up from its starting 5,000).
    expect(y95.tfsa).toBeGreaterThan(100000)
  })

  it('set to spend it, pays the whole forced withdrawal out as extra income instead', () => {
    const rows = runForecast(forcedSurplusInput(false))
    const y95 = rows.find((r) => r.age === 95)!
    expect(y95.forcedMinimumWithdrawal).toBe(true)
    // All the forced cash is delivered as spendable income, far more than asked for.
    expect(y95.netFromSavings).toBeGreaterThan(100000)
    // ...and the TFSA is untouched by it (still just its own starting balance).
    expect(y95.tfsa).toBeCloseTo(5000, 2)
  })

  it('conserves total wealth either way — reinvesting just moves the surplus, not the amount', () => {
    const reinvested = runForecast(forcedSurplusInput(true)).find((r) => r.age === 95)!
    const spent = runForecast(forcedSurplusInput(false)).find((r) => r.age === 95)!
    expect(reinvested.netFromSavings + reinvested.tfsa).toBeCloseTo(
      spent.netFromSavings + spent.tfsa,
      3,
    )
  })

  it('a manual override for the year skips reinvestment entirely, since it represents explicit intent', () => {
    const input = forcedSurplusInput(true)
    input.withdrawalOverrides = { 95: { rrspWithdrawal: 200000 } }
    const rows = runForecast(input)
    const y95 = rows.find((r) => r.age === 95)!
    expect(y95.rrspWithdrawal).toBe(200000)
    // No redirection happened — the override's implied cash is simply delivered.
    expect(y95.netFromSavings).toBeGreaterThan(100000)
    expect(y95.tfsa).toBeCloseTo(5000, 2)
  })

  it("doesn't misfire a shortfall from float rounding when the forced withdrawal dwarfs the actual need", () => {
    // At an extreme (unrealistic) compounding rate over a long horizon, the
    // forced RRSP withdrawal and the reinvested surplus both run into the
    // quadrillions while the saver's real need stays a modest four-figure
    // sum. Computing net cash as "huge minus almost-as-huge" loses enough
    // precision to dip a cent or two below the requirement and wrongly flag
    // a shortfall — this plan very much has enough, so it shouldn't.
    const input: ForecastInput = {
      initial: {
        currentAge: 35,
        currentRRSP: 900000,
        currentTFSA: 5000,
        currentIncome: 90000,
        retirementAge: 65,
        currentRRSPRoom: 40000,
      },
      province: 'BC',
      savingsPlan: [seg({ monthlyRRSP: 500, monthlyTFSA: 500, untilAge: 65 })],
      retirement: {
        incomePlan: [{ id: 'income-1', requiredMonthlyIncome: 4000, untilAge: 100 }],
        cppMonthly: 1000,
        cppStartAge: 65,
        oasMonthly: 700,
        oasStartAge: 65,
      },
      rateOfReturn: 0.5,
      bestYearReturn: 0.5,
      worstYearReturn: 0.5,
      seed: 1,
      endAge: 100,
      reinvestForcedWithdrawals: true,
      contributionOverrides: {},
      withdrawalOverrides: {},
    }
    const rows = runForecast(input)
    expect(rows.some((r) => r.shortfall)).toBe(false)
  })
})

describe('runForecast: RRSP contribution room accrues and is spent by contributions', () => {
  it('adds 18% of income as new room each accumulation year, then subtracts the RRSP contribution', () => {
    // income 100,000 -> accrual 18,000/yr (well under the annual dollar cap).
    // Starting room 10,000. seg contributes $1,000/mo RRSP -> $12,000/yr base.
    // $100,000 sits in the second federal bracket (20.5%) and second BC
    // bracket (10.5%) -> 31% marginal, so the reinvested refund adds
    // 12,000 * 0.31 = 3,720, for a total RRSP contribution of 15,720 that
    // room is spent against.
    // Age 64 (only accumulation year): room = 10,000 + 18,000 - 15,720 = 12,280.
    const input = baseInput()
    input.initial.currentIncome = 100000
    input.initial.currentRRSPRoom = 10000
    input.savingsPlan = [seg({ monthlyRRSP: 1000, untilAge: 65 })]
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 64)!.rrspRoom).toBeCloseTo(12280, 6)
  })

  it('caps the annual accrual at the CRA dollar limit for high earners', () => {
    // income 500,000 -> 18% = 90,000, but capped at RRSP_ANNUAL_DOLLAR_LIMIT.
    const input = baseInput()
    input.initial.currentIncome = 500000
    input.initial.currentRRSPRoom = 0
    input.savingsPlan = [seg({ monthlyRRSP: 0, untilAge: 65 })]
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 64)!.rrspRoom).toBeCloseTo(RRSP_ANNUAL_DOLLAR_LIMIT, 6)
  })

  it('goes negative when contributions outstrip available room', () => {
    // No income means no accrual, but the marginal rate on a $0 income is
    // still the lowest bracket (20.06%), so the $12,000 base contribution
    // reinvests a 2,407.20 refund -> 14,407.20 total spent against room.
    const input = baseInput()
    input.initial.currentIncome = 0 // no accrual
    input.initial.currentRRSPRoom = 5000
    input.savingsPlan = [seg({ monthlyRRSP: 1000, untilAge: 65 })]
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 64)!.rrspRoom).toBeCloseTo(5000 - 14407.2, 6)
  })

  it('holds room flat through retirement (no earned income, no contributions)', () => {
    const input = baseInput()
    input.initial.currentRRSPRoom = 25000
    input.initial.currentIncome = 0
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    const y66 = rows.find((r) => r.age === 66)!
    expect(y65.rrspRoom).toBeCloseTo(25000, 6)
    expect(y66.rrspRoom).toBeCloseTo(25000, 6)
  })
})

describe('runForecast: variability applies a per-year sampled rate instead of a flat one', () => {
  it('reports the flat rate as appliedRateOfReturn on every row when best/worst equal the average', () => {
    // baseInput() has bestYearReturn === worstYearReturn === rateOfReturn (0.10) — degenerate, no variability.
    const rows = runForecast(baseInput())
    expect(rows.every((r) => r.appliedRateOfReturn === 0.1)).toBe(true)
  })

  it("matches the standalone yearlyReturns sequence exactly, aligned across the accumulation/retirement boundary", () => {
    const input = baseInput()
    input.initial.currentAge = 60
    input.initial.retirementAge = 65
    input.endAge = 70
    input.bestYearReturn = 0.3
    input.worstYearReturn = -0.2
    input.seed = 777

    const rows = runForecast(input)
    const expectedRates = yearlyReturns(
      input.seed,
      input.endAge - input.initial.currentAge + 1,
      input.rateOfReturn,
      input.worstYearReturn,
      input.bestYearReturn,
    )
    expect(rows.map((r) => r.appliedRateOfReturn)).toEqual(expectedRates)
    // Sanity: ages run contiguously from currentAge to endAge with no gaps,
    // so the index alignment above is meaningful, not coincidental.
    expect(rows.map((r) => r.age)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70])
  })

  it('produces the same forecast for the same seed, and a different one for a different seed', () => {
    const inputA = baseInput()
    inputA.bestYearReturn = 0.3
    inputA.worstYearReturn = -0.2
    inputA.seed = 1

    const inputB = { ...inputA, seed: 1 }
    const inputC = { ...inputA, seed: 2 }

    const rowsA = runForecast(inputA)
    const rowsB = runForecast(inputB)
    const rowsC = runForecast(inputC)

    expect(rowsA.map((r) => r.total)).toEqual(rowsB.map((r) => r.total))
    expect(rowsA.map((r) => r.total)).not.toEqual(rowsC.map((r) => r.total))
  })

  it('never applies a rate outside the configured [worst, best] bounds', () => {
    const input = baseInput()
    input.initial.currentAge = 30
    input.endAge = 100
    input.bestYearReturn = 0.25
    input.worstYearReturn = -0.15
    input.seed = 42

    const rows = runForecast(input)
    for (const row of rows) {
      expect(row.appliedRateOfReturn).toBeGreaterThanOrEqual(-0.15)
      expect(row.appliedRateOfReturn).toBeLessThanOrEqual(0.25)
    }
    // With 70+ sampled years spanning a wide range, at least some should
    // meaningfully differ from the flat average — otherwise variability
    // silently isn't being applied at all.
    const distinctRates = new Set(rows.map((r) => r.appliedRateOfReturn.toFixed(6)))
    expect(distinctRates.size).toBeGreaterThan(1)
  })
})

describe('runForecast: averageReturnToDate tracks the running average of applied rates', () => {
  it('equals the flat rate every year when there is no variability', () => {
    // baseInput() has bestYearReturn === worstYearReturn === rateOfReturn (0.10).
    const rows = runForecast(baseInput())
    expect(rows.every((r) => Math.abs(r.averageReturnToDate - 0.1) < 1e-9)).toBe(true)
  })

  it("on the first year, equals that year's own applied rate", () => {
    const input = baseInput()
    input.bestYearReturn = 0.3
    input.worstYearReturn = -0.2
    input.seed = 9
    const rows = runForecast(input)
    expect(rows[0].averageReturnToDate).toBeCloseTo(rows[0].appliedRateOfReturn, 10)
  })

  it('matches a hand-computed running mean of appliedRateOfReturn at every row', () => {
    const input = baseInput()
    input.initial.currentAge = 60
    input.initial.retirementAge = 65
    input.endAge = 75
    input.bestYearReturn = 0.3
    input.worstYearReturn = -0.2
    input.seed = 123

    const rows = runForecast(input)
    let runningSum = 0
    rows.forEach((row, i) => {
      runningSum += row.appliedRateOfReturn
      expect(row.averageReturnToDate).toBeCloseTo(runningSum / (i + 1), 10)
    })
  })

  it("is NOT guaranteed to equal the assumed average — a finite sampled sequence can land away from it", () => {
    // A real property of the model, not a bug (the sampling is unbiased —
    // see variability.test.ts — but unbiased still means "averages out over
    // many years", not "every short run hits the target"): pick a
    // seed/scenario where the final average-to-date provably differs from
    // the 10% assumed average.
    const input = baseInput()
    input.bestYearReturn = 0.3
    input.worstYearReturn = -0.2
    input.seed = 7
    const rows = runForecast(input)
    const last = rows[rows.length - 1]
    expect(last.averageReturnToDate).not.toBeCloseTo(0.1, 1)
  })

  it('over a realistic 65-year horizon with asymmetric bounds, converges close to the assumed average across many seeds', () => {
    // Regression test for a real bug: the original variability model scaled
    // a symmetric variate by different up/down factors, which is unbiased
    // ONLY when best/worst are symmetric around the average. Here the
    // downside spread (20pp) is bigger than the upside (15pp) — exactly the
    // asymmetric shape that used to systematically drag the long-run
    // average down below the stated 5%. A long horizon averaged across many
    // seeds should land close to it now.
    const finalAverages = Array.from({ length: 30 }, (_, i) => {
      const input = baseInput()
      input.initial.currentAge = 35
      input.initial.retirementAge = 65
      input.endAge = 100
      input.rateOfReturn = 0.05
      input.bestYearReturn = 0.2
      input.worstYearReturn = -0.15
      input.seed = i + 1
      const rows = runForecast(input)
      return rows[rows.length - 1].averageReturnToDate
    })
    const meanAcrossSeeds =
      finalAverages.reduce((a, b) => a + b, 0) / finalAverages.length
    expect(meanAcrossSeeds).toBeCloseTo(0.05, 2)
  })
})
