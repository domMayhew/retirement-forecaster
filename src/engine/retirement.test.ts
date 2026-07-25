// SPEC: Retirement phase — one year of drawing down savings.
//
// Withdrawals take the SAME PERCENTAGE from each account. Only the RRSP
// portion is taxable; TFSA is tax-free. CPP/OAS and the RRSP withdrawal are
// taxed TOGETHER under progressive federal + provincial brackets (see
// ./tax.ts) — there's no single flat rate to solve for algebraically like a
// flat-tax model could, so the engine bisects the withdrawal fraction until
// the resulting after-tax income matches the requirement (see forecast.ts).
//
// The numbers below stay within the first federal AND first BC bracket
// (combined 20.06%), so the math reduces to simple flat-rate algebra and
// stays hand-checkable, even though the underlying engine is solving a
// genuinely progressive-bracket problem.

import { describe, it, expect } from 'vitest'
import { computeRetirementWithdrawal, cppForAge, oasForAge } from './forecast'
import type { RetirementPlan } from './types'

const PROVINCE = 'BC' as const
// Combined federal (15%) + BC (5.06%) first-bracket rate.
const BRACKET_1_RATE = 0.2006

describe('Retirement: the key correctness property — net cash delivered equals the requirement', () => {
  it('nets exactly the $8,997 requirement from a 50/50 RRSP/TFSA split, within the first tax bracket', () => {
    // rrsp 20,000, tfsa 20,000, total 40,000
    // rrspShare = 0.5 ; netTaxRate = 0.5 * 0.2006 = 0.1003
    // actualWithdrawal = 8,997 / 0.8997 = 10,000
    // withdrawalPct = 10,000 / 40,000 = 0.25
    // rrspWithdrawal = 5,000 ; tfsaWithdrawal = 5,000
    // taxPaid = 5,000 * 0.2006 = 1,003
    // net = (5,000 - 1,003) + 5,000 = 8,997  === requirement
    const r = computeRetirementWithdrawal(20000, 20000, 8997, 0, PROVINCE)

    expect(r.rrspWithdrawal).toBeCloseTo(5000, 2)
    expect(r.tfsaWithdrawal).toBeCloseTo(5000, 2)
    expect(r.taxPaid).toBeCloseTo(1003, 2)
    // THE property: after-tax cash delivered === the required income.
    expect(r.netFromSavings).toBeCloseTo(8997, 2)
    // Same percentage taken from each account: 10,000 / 40,000 = 25%.
    expect(r.withdrawalPct).toBeCloseTo(0.25, 6)
  })

  it('holds the net === requirement property for a lopsided 70/30 split too', () => {
    const requiredAnnualIncome = 6660
    const r = computeRetirementWithdrawal(14000, 6000, requiredAnnualIncome, 0, PROVINCE)
    expect(r.netFromSavings).toBeCloseTo(requiredAnnualIncome, 2)
    // withdrawals are the same percentage of each account
    const pctR = r.rrspWithdrawal / 14000
    const pctT = r.tfsaWithdrawal / 6000
    expect(pctR).toBeCloseTo(pctT, 6)
  })
})

describe('Retirement: an all-RRSP saver is taxed on the whole withdrawal', () => {
  it('grosses up a $7,994 requirement to a $10,000 RRSP withdrawal, within the first tax bracket', () => {
    // actualWithdrawal = 7,994 / (1 - 0.2006) = 10,000
    const r = computeRetirementWithdrawal(20000, 0, 7994, 0, PROVINCE)
    expect(r.rrspWithdrawal).toBeCloseTo(10000, 2)
    expect(r.tfsaWithdrawal).toBe(0)
    expect(r.taxPaid).toBeCloseTo(10000 * BRACKET_1_RATE, 2)
    expect(r.netFromSavings).toBeCloseTo(7994, 2)
  })
})

describe('Retirement: an all-TFSA saver pays no tax', () => {
  it('withdraws exactly the $15,000 requirement with zero tax', () => {
    const r = computeRetirementWithdrawal(0, 20000, 15000, 0, PROVINCE)
    expect(r.rrspWithdrawal).toBe(0)
    expect(r.tfsaWithdrawal).toBeCloseTo(15000, 6)
    expect(r.taxPaid).toBe(0)
    expect(r.netFromSavings).toBeCloseTo(15000, 6)
  })
})

describe('Retirement: no withdrawal when income already covers the need', () => {
  it('takes nothing from savings when the requirement is zero or negative', () => {
    // e.g. CPP + OAS alone already exceed the requirement.
    const r = computeRetirementWithdrawal(20000, 20000, -2000, 0, PROVINCE)
    expect(r.rrspWithdrawal).toBe(0)
    expect(r.tfsaWithdrawal).toBe(0)
    expect(r.taxPaid).toBe(0)
    expect(r.netFromSavings).toBe(0)
    expect(r.shortfall).toBe(false)
  })
})

describe('Retirement: shortfall when savings cannot cover the requirement', () => {
  it('drains both accounts and flags a shortfall when the required withdrawal exceeds the balance', () => {
    // total = 10,000 but the grossed-up withdrawal needed far exceeds it.
    const r = computeRetirementWithdrawal(5000, 5000, 20000, 0, PROVINCE)
    expect(r.rrspWithdrawal).toBe(5000)
    expect(r.tfsaWithdrawal).toBe(5000)
    expect(r.taxPaid).toBeCloseTo(5000 * BRACKET_1_RATE, 2)
    expect(r.netFromSavings).toBeCloseTo(5000 * (1 - BRACKET_1_RATE) + 5000, 2)
    expect(r.shortfall).toBe(true)
  })

  it('flags a shortfall when there is nothing left to withdraw', () => {
    const r = computeRetirementWithdrawal(0, 0, 30000, 0, PROVINCE)
    expect(r.rrspWithdrawal).toBe(0)
    expect(r.tfsaWithdrawal).toBe(0)
    expect(r.netFromSavings).toBe(0)
    expect(r.shortfall).toBe(true)
  })
})

describe('Retirement: CPP and OAS are entered monthly (pre-tax) and switch on at their start ages', () => {
  const plan: RetirementPlan = {
    incomePlan: [{ id: 'income-1', requiredMonthlyIncome: 4000, untilAge: 100 }],
    cppMonthly: 1250, // 15,000 / yr gross
    cppStartAge: 65,
    oasMonthly: 500, // 6,000 / yr gross
    oasStartAge: 67,
  }

  it('pays no CPP before 65 and the full GROSS ANNUAL amount (monthly * 12) from 65 on', () => {
    expect(cppForAge(64, plan)).toBe(0)
    expect(cppForAge(65, plan)).toBe(15000) // 1,250 * 12
    expect(cppForAge(70, plan)).toBe(15000)
  })

  it('pays no OAS before 67 and the full GROSS ANNUAL amount from 67 on', () => {
    expect(oasForAge(66, plan)).toBe(0)
    expect(oasForAge(67, plan)).toBe(6000) // 500 * 12
  })
})

// DEFERRED — mandatory 5%-of-RRSP withdrawal starting at age 72.
// The human asked to skip this for now; it is NOT wired into runForecast.
describe('Retirement: mandatory age-72 RRSP minimum withdrawal (DEFERRED)', () => {
  it.todo(
    'from age 72, withdraws at least 5% of the RRSP balance even when income need is lower, ' +
      'taxing the forced excess',
  )
})
