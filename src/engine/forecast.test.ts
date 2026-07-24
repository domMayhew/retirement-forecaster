// SPEC: runForecast — stitches accumulation + retirement into a full projection.
//
// PHASE BOUNDARIES (documented convention):
//   accumulation : ages [currentAge, retirementAge)   — up to retirementAge - 1
//   retirement   : ages [retirementAge, endAge]        — inclusive of endAge
//
// Growth-timing convention throughout: "flow first, then grow."

import { describe, it, expect } from 'vitest'
import { runForecast, RRSP_ANNUAL_DOLLAR_LIMIT } from './forecast'
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
//   - Retirement years 65 and 66 each need $45,000/yr from a 50/50 split at 20% tax.
//
//   Accumulation age 64: (100,000) * 1.10 = 110,000 in each account.
//   Retirement age 65: total 220,000; gross withdrawal 50,000 (25k + 25k);
//                      tax 5,000; net 45,000; then grow: 85,000 * 1.10 = 93,500 each.
//   Retirement age 66: total 187,000; again 25k + 25k out, net 45,000;
//                      then grow: 68,500 * 1.10 = 75,350 each.
function baseInput(): ForecastInput {
  return {
    initial: {
      currentAge: 64,
      currentRRSP: 100000,
      currentTFSA: 100000,
      currentIncome: 0,
      retirementAge: 65,
      incomeTaxRate: 0.25,
      currentRRSPRoom: 200000,
    },
    savingsPlan: [seg({ untilAge: 65 })],
    retirement: {
      requiredMonthlyIncome: 3750, // 45,000 / yr
      cppMonthly: 0,
      cppStartAge: 200, // effectively never
      oasMonthly: 0,
      oasStartAge: 200, // effectively never
      retirementTaxRate: 0.20,
    },
    rateOfReturn: 0.10,
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
  it('at age 65 withdraws 25k+25k, pays 5k tax, nets the 45k gap, then grows to 93.5k each', () => {
    const rows = runForecast(baseInput())
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.rrspWithdrawal).toBeCloseTo(25000, 6)
    expect(y65.tfsaWithdrawal).toBeCloseTo(25000, 6)
    expect(y65.taxPaid).toBeCloseTo(5000, 6)
    expect(y65.netFromSavings).toBeCloseTo(45000, 6)
    expect(y65.rrsp).toBeCloseTo(93500, 6)
    expect(y65.tfsa).toBeCloseTo(93500, 6)
    expect(y65.shortfall).toBe(false)
  })

  it('at age 66 again nets the 45k gap and grows the remainder to 75,350 each', () => {
    const rows = runForecast(baseInput())
    const y66 = rows.find((r) => r.age === 66)!
    expect(y66.netFromSavings).toBeCloseTo(45000, 6)
    expect(y66.rrsp).toBeCloseTo(75350, 6)
    expect(y66.tfsa).toBeCloseTo(75350, 6)
  })
})

describe('runForecast: manual withdrawal overrides replace the solved-for amount for that age', () => {
  it('overrides just the RRSP withdrawal, recomputing tax/net and flagging the shortfall this creates', () => {
    // Age 65 naturally withdraws 25k/25k for a 45k net. Override RRSP down
    // to 10,000: tax = 2,000, net = 10,000 - 2,000 + 25,000 (TFSA untouched,
    // still the naturally solved amount) = 33,000 — under the 45k need.
    const input = baseInput()
    input.withdrawalOverrides = { 65: { rrspWithdrawal: 10000 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.rrspWithdrawal).toBe(10000)
    expect(y65.taxPaid).toBeCloseTo(2000, 6)
    expect(y65.tfsaWithdrawal).toBeCloseTo(25000, 6)
    expect(y65.netFromSavings).toBeCloseTo(33000, 6)
    expect(y65.shortfall).toBe(true)
    expect(y65.rrsp).toBeCloseTo((110000 - 10000) * 1.1, 6)
    expect(y65.tfsa).toBeCloseTo((110000 - 25000) * 1.1, 6)
  })

  it('overrides just the TFSA withdrawal, leaving RRSP solved normally', () => {
    const input = baseInput()
    input.withdrawalOverrides = { 65: { tfsaWithdrawal: 10000 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.tfsaWithdrawal).toBe(10000)
    expect(y65.rrspWithdrawal).toBeCloseTo(25000, 6)
    expect(y65.netFromSavings).toBeCloseTo(25000 - 5000 + 10000, 6)
    expect(y65.shortfall).toBe(true)
  })

  it('overrides both accounts at once', () => {
    const input = baseInput()
    input.withdrawalOverrides = { 65: { rrspWithdrawal: 5000, tfsaWithdrawal: 5000 } }
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.taxPaid).toBeCloseTo(1000, 6)
    expect(y65.netFromSavings).toBeCloseTo(9000, 6)
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
    input.retirement.requiredMonthlyIncome = 100
    input.endAge = 72
    input.withdrawalOverrides = { 72: { rrspWithdrawal: 100 } }
    const rows = runForecast(input)
    const y72 = rows.find((r) => r.age === 72)!
    expect(y72.rrspWithdrawal).toBe(100)
    expect(y72.forcedMinimumWithdrawal).toBe(true)
  })
})

describe('runForecast: CPP/OAS are pre-tax and reduce the amount drawn from savings', () => {
  it('applies the retirement tax rate to CPP, so only its AFTER-TAX value shrinks the gap', () => {
    // $1,250/mo CPP -> $15,000/yr gross. At 20% tax the after-tax CPP is
    // 15,000 * 0.80 = 12,000. The 45k need therefore leaves a 33k gap that
    // savings must net.
    const input = baseInput()
    input.retirement.cppMonthly = 1250
    input.retirement.cppStartAge = 65
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.cpp).toBe(15000) // gross annual
    expect(y65.cppAfterTax).toBeCloseTo(12000, 6) // after 20% tax
    // gap now 33,000 -> net cash from savings equals that gap.
    expect(y65.netFromSavings).toBeCloseTo(33000, 6)
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
    // $12,000 after-tax CPP against the $45,000 need -> 33,000 from savings.
    // Income mix: 33,000/45,000 from savings, 12,000/45,000 from CPP.
    const input = baseInput()
    input.retirement.cppMonthly = 1250
    input.retirement.cppStartAge = 65
    const rows = runForecast(input)
    const y65 = rows.find((r) => r.age === 65)!
    expect(y65.incomeFromSavingsPct).toBeCloseTo(33000 / 45000, 6)
    expect(y65.incomeFromCppOasPct).toBeCloseTo(12000 / 45000, 6)
    expect(y65.incomeFromSavingsPct + y65.incomeFromCppOasPct).toBeCloseTo(1, 9)
  })
})

describe('runForecast: ordered savings-plan segments switch at their untilAge', () => {
  it('applies segment 1 through its untilAge, then segment 2 for later years', () => {
    // Ages 40,41,42 are accumulation (retirementAge 43). incomeTaxRate 0 and
    // rateOfReturn 0 so each contribution lands 1:1.
    //   seg1 (until 41): $1,000/mo -> 12,000/yr  -> applies to ages 40, 41
    //   seg2 (until 43): $2,000/mo -> 24,000/yr  -> applies to age 42
    //   RRSP: 12,000 -> 24,000 -> 48,000
    const input: ForecastInput = {
      initial: {
        currentAge: 40,
        currentRRSP: 0,
        currentTFSA: 0,
        currentIncome: 0,
        retirementAge: 43,
        incomeTaxRate: 0,
        currentRRSPRoom: 200000,
      },
      savingsPlan: [
        seg({ id: 'a', monthlyRRSP: 1000, untilAge: 41 }),
        seg({ id: 'b', monthlyRRSP: 2000, untilAge: 43 }),
      ],
      retirement: {
        requiredMonthlyIncome: 0,
        cppMonthly: 0,
        cppStartAge: 200,
        oasMonthly: 0,
        oasStartAge: 200,
        retirementTaxRate: 0.15,
      },
      rateOfReturn: 0,
      endAge: 43,
      reinvestForcedWithdrawals: true,
      contributionOverrides: {},
      withdrawalOverrides: {},
    }
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 40)!.rrsp).toBeCloseTo(12000, 6)
    expect(rows.find((r) => r.age === 41)!.rrsp).toBeCloseTo(24000, 6)
    expect(rows.find((r) => r.age === 42)!.rrsp).toBeCloseTo(48000, 6)
  })
})

describe('runForecast: running out of money flags a shortfall', () => {
  it('marks shortfall = true once the accounts are exhausted', () => {
    const input = baseInput()
    // Require far more than the modest balances can sustain.
    input.retirement.requiredMonthlyIncome = 100000 // 1.2M/yr
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
    input.retirement.requiredMonthlyIncome = 100 // far below the mandatory minimum
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
        incomeTaxRate: 0.25,
        currentRRSPRoom: 0,
      },
      savingsPlan: [seg({ untilAge: 95 })],
      retirement: {
        requiredMonthlyIncome: 1000 / 12,
        cppMonthly: 0,
        cppStartAge: 200,
        oasMonthly: 0,
        oasStartAge: 200,
        retirementTaxRate: 0.15,
      },
      rateOfReturn: 0,
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
      6,
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
        incomeTaxRate: 0.25,
        currentRRSPRoom: 40000,
      },
      savingsPlan: [seg({ monthlyRRSP: 500, monthlyTFSA: 500, untilAge: 65 })],
      retirement: {
        requiredMonthlyIncome: 4000,
        cppMonthly: 1000,
        cppStartAge: 65,
        oasMonthly: 700,
        oasStartAge: 65,
        retirementTaxRate: 0.15,
      },
      rateOfReturn: 0.5,
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
    // Starting room 10,000. seg contributes $1,000/mo RRSP, 0% tax -> $12,000/yr.
    // Age 64 (only accumulation year): room = 10,000 + 18,000 - 12,000 = 16,000.
    const input = baseInput()
    input.initial.currentIncome = 100000
    input.initial.currentRRSPRoom = 10000
    input.initial.incomeTaxRate = 0
    input.savingsPlan = [seg({ monthlyRRSP: 1000, untilAge: 65 })]
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 64)!.rrspRoom).toBeCloseTo(16000, 6)
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
    const input = baseInput()
    input.initial.currentIncome = 0 // no accrual
    input.initial.currentRRSPRoom = 5000
    input.initial.incomeTaxRate = 0
    input.savingsPlan = [seg({ monthlyRRSP: 1000, untilAge: 65 })] // $12,000/yr contribution
    const rows = runForecast(input)
    expect(rows.find((r) => r.age === 64)!.rrspRoom).toBeCloseTo(-7000, 6)
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
