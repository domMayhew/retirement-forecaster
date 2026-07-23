// SPEC: Retirement phase — one year of drawing down savings.
//
// Each year the "gap" is the after-tax income that must come from savings:
//   gap = requiredAnnualIncome - cpp - oas
// Withdrawals take the SAME PERCENTAGE from each account. Only the RRSP
// portion is taxed (retirementTaxRate); TFSA is tax-free. We solve exactly so
// the after-tax cash delivered equals the gap.

import { describe, it, expect } from 'vitest'
import { computeRetirementWithdrawal, cppForAge, oasForAge } from './forecast'
import type { RetirementPlan } from './types'

describe('Retirement: the key correctness property — net cash delivered equals the gap', () => {
  it('nets exactly the $45,000 gap from a 50/50 RRSP/TFSA split at a 20% RRSP tax rate', () => {
    // rrsp 100,000, tfsa 100,000, total 200,000
    // rrspShare = 0.5 ; netTaxRate = 0.5 * 0.20 = 0.10
    // actualWithdrawal = 45,000 / 0.90 = 50,000
    // withdrawalPct = 50,000 / 200,000 = 0.25
    // rrspWithdrawal = 25,000 ; tfsaWithdrawal = 25,000
    // taxPaid = 25,000 * 0.20 = 5,000
    // net = (25,000 - 5,000) + 25,000 = 45,000  === gap
    const r = computeRetirementWithdrawal(100000, 100000, 45000, 0.20)

    expect(r.rrspWithdrawal).toBeCloseTo(25000, 6)
    expect(r.tfsaWithdrawal).toBeCloseTo(25000, 6)
    expect(r.taxPaid).toBeCloseTo(5000, 6)
    // THE property: after-tax cash delivered === the required gap.
    expect(r.netFromSavings).toBeCloseTo(45000, 6)
  })

  it('holds the net === gap property for a lopsided 70/30 split too', () => {
    const gap = 33333
    const r = computeRetirementWithdrawal(70000, 30000, gap, 0.15)
    expect(r.netFromSavings).toBeCloseTo(gap, 6)
    // withdrawals are the same percentage of each account
    const pctR = r.rrspWithdrawal / 70000
    const pctT = r.tfsaWithdrawal / 30000
    expect(pctR).toBeCloseTo(pctT, 9)
  })
})

describe('Retirement: an all-RRSP saver is taxed on the whole withdrawal', () => {
  it('grosses up a $40,000 gap to a $50,000 RRSP withdrawal at 20% tax', () => {
    // rrspShare = 1 ; netTaxRate = 0.20
    // actualWithdrawal = 40,000 / 0.80 = 50,000
    const r = computeRetirementWithdrawal(100000, 0, 40000, 0.20)
    expect(r.rrspWithdrawal).toBeCloseTo(50000, 6)
    expect(r.tfsaWithdrawal).toBe(0)
    expect(r.taxPaid).toBeCloseTo(10000, 6)
    expect(r.netFromSavings).toBeCloseTo(40000, 6)
  })
})

describe('Retirement: an all-TFSA saver pays no tax', () => {
  it('withdraws exactly the $30,000 gap with zero tax', () => {
    const r = computeRetirementWithdrawal(0, 100000, 30000, 0.20)
    expect(r.rrspWithdrawal).toBe(0)
    expect(r.tfsaWithdrawal).toBeCloseTo(30000, 6)
    expect(r.taxPaid).toBe(0)
    expect(r.netFromSavings).toBeCloseTo(30000, 6)
  })
})

describe('Retirement: no withdrawal when income already covers the need', () => {
  it('takes nothing from savings when the gap is zero or negative', () => {
    // gap <= 0 (e.g. CPP + OAS already exceed the requirement)
    const r = computeRetirementWithdrawal(100000, 100000, -2000, 0.20)
    expect(r.rrspWithdrawal).toBe(0)
    expect(r.tfsaWithdrawal).toBe(0)
    expect(r.taxPaid).toBe(0)
    expect(r.netFromSavings).toBe(0)
    expect(r.shortfall).toBe(false)
  })
})

describe('Retirement: shortfall when savings cannot cover the gap', () => {
  it('drains both accounts and flags a shortfall when the required withdrawal exceeds the balance', () => {
    // total = 20,000 but the grossed-up withdrawal needed far exceeds it.
    const r = computeRetirementWithdrawal(10000, 10000, 50000, 0.20)
    expect(r.rrspWithdrawal).toBe(10000)
    expect(r.tfsaWithdrawal).toBe(10000)
    expect(r.taxPaid).toBeCloseTo(2000, 6) // 10,000 * 0.20
    expect(r.netFromSavings).toBeCloseTo(18000, 6) // (10,000 - 2,000) + 10,000
    expect(r.shortfall).toBe(true)
  })

  it('flags a shortfall when there is nothing left to withdraw', () => {
    const r = computeRetirementWithdrawal(0, 0, 30000, 0.20)
    expect(r.rrspWithdrawal).toBe(0)
    expect(r.tfsaWithdrawal).toBe(0)
    expect(r.netFromSavings).toBe(0)
    expect(r.shortfall).toBe(true)
  })
})

describe('Retirement: CPP and OAS switch on at their start ages', () => {
  const plan: RetirementPlan = {
    requiredMonthlyIncome: 4000,
    cppAnnual: 15000,
    cppStartAge: 65,
    oasAnnual: 8000,
    oasStartAge: 67,
    retirementTaxRate: 0.15,
  }

  it('pays no CPP before 65 and full CPP from 65 on', () => {
    expect(cppForAge(64, plan)).toBe(0)
    expect(cppForAge(65, plan)).toBe(15000)
    expect(cppForAge(70, plan)).toBe(15000)
  })

  it('pays no OAS before 67 and full OAS from 67 on', () => {
    expect(oasForAge(66, plan)).toBe(0)
    expect(oasForAge(67, plan)).toBe(8000)
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
