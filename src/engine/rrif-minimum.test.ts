// SPEC: Mandatory RRIF minimum withdrawal — forced from age 72 on.
//
// The CRA prescribes a minimum percentage of the RRSP/RRIF's START-of-year
// balance that must come out each year, rising with age. When the
// income-driven withdrawal already clears that minimum, nothing changes.
// When it doesn't, the RRSP withdrawal is forced up to the minimum and the
// extra after-tax cash this generates reduces the TFSA withdrawal by the
// same amount (the saver only needed the original gap).

import { describe, it, expect } from 'vitest'
import { rrifMinimumFactor, applyRRIFMinimum, computeRetirementWithdrawal } from './forecast'

describe('rrifMinimumFactor: prescribed CRA table', () => {
  it('is 0 before age 72', () => {
    expect(rrifMinimumFactor(71)).toBe(0)
    expect(rrifMinimumFactor(0)).toBe(0)
  })

  it('matches the prescribed factors at a few known ages', () => {
    expect(rrifMinimumFactor(72)).toBeCloseTo(0.054, 6)
    expect(rrifMinimumFactor(75)).toBeCloseTo(0.0582, 6)
    expect(rrifMinimumFactor(80)).toBeCloseTo(0.0682, 6)
    expect(rrifMinimumFactor(90)).toBeCloseTo(0.1192, 6)
  })

  it('is a flat 20% from age 95 on', () => {
    expect(rrifMinimumFactor(95)).toBeCloseTo(0.2, 6)
    expect(rrifMinimumFactor(100)).toBeCloseTo(0.2, 6)
    expect(rrifMinimumFactor(120)).toBeCloseTo(0.2, 6)
  })
})

describe('applyRRIFMinimum: leaves the withdrawal alone when it already clears the minimum', () => {
  it('passes the base withdrawal through unchanged, forcedMinimum false', () => {
    // Age 72 minimum is 5.4% of 500,000 = 27,000. A 50,000 base withdrawal
    // already clears it.
    const base = computeRetirementWithdrawal(250000, 250000, 50000, 0.15)
    const result = applyRRIFMinimum(base, 250000, 250000, 72, 0.15)
    expect(result.forcedMinimum).toBe(false)
    expect(result.rrspWithdrawal).toBeCloseTo(base.rrspWithdrawal, 6)
    expect(result.tfsaWithdrawal).toBeCloseTo(base.tfsaWithdrawal, 6)
  })
})

describe('applyRRIFMinimum: forces the RRSP up and reduces the TFSA to compensate', () => {
  it('forces the minimum out of the RRSP and pulls the surplus off the TFSA withdrawal', () => {
    // Age 80 minimum = 6.82% of 400,000 = 27,280.
    // Suppose the income-driven plan needed only 10,000 total, split evenly:
    // 5,000 RRSP / 5,000 TFSA (from a 50/50 base at some low tax rate — use
    // computeRetirementWithdrawal to get a realistic starting point).
    const startRRSP = 400000
    const startTFSA = 400000
    const taxRate = 0.15
    const base = computeRetirementWithdrawal(startRRSP, startTFSA, 10000, taxRate)
    const result = applyRRIFMinimum(base, startRRSP, startTFSA, 80, taxRate)

    const expectedMinRRSP = startRRSP * 0.0682 // 27,280
    expect(result.forcedMinimum).toBe(true)
    expect(result.rrspWithdrawal).toBeCloseTo(expectedMinRRSP, 2)

    // Extra RRSP withdrawal beyond what was needed, after tax, offsets the
    // TFSA withdrawal dollar-for-dollar.
    const extraAfterTax = (expectedMinRRSP - base.rrspWithdrawal) * (1 - taxRate)
    expect(result.tfsaWithdrawal).toBeCloseTo(Math.max(0, base.tfsaWithdrawal - extraAfterTax), 2)

    // The saver still nets at least the original need — forcing the
    // minimum never leaves them with less than they asked for.
    expect(result.netFromSavings).toBeGreaterThanOrEqual(base.netFromSavings - 1e-6)
  })

  it('zeroes the TFSA withdrawal and still delivers extra cash when the forced surplus exceeds it', () => {
    // Age 95 minimum is 20% — against a huge RRSP with almost no income
    // need, the forced withdrawal dwarfs the small TFSA.
    const startRRSP = 1000000
    const startTFSA = 5000
    const taxRate = 0.15
    const base = computeRetirementWithdrawal(startRRSP, startTFSA, 1000, taxRate)
    const result = applyRRIFMinimum(base, startRRSP, startTFSA, 95, taxRate)

    expect(result.forcedMinimum).toBe(true)
    expect(result.rrspWithdrawal).toBeCloseTo(startRRSP * 0.2, 2)
    expect(result.tfsaWithdrawal).toBe(0)
    // Way more after-tax cash than the saver needed, but that's the point —
    // the mandatory minimum doesn't cap itself at the income requirement.
    expect(result.netFromSavings).toBeGreaterThan(base.netFromSavings)
  })

  it('does not force more than the whole RRSP balance', () => {
    const startRRSP = 1000
    const startTFSA = 0
    const taxRate = 0.15
    const base = computeRetirementWithdrawal(startRRSP, startTFSA, 100, taxRate)
    const result = applyRRIFMinimum(base, startRRSP, startTFSA, 95, taxRate)
    expect(result.rrspWithdrawal).toBeLessThanOrEqual(startRRSP)
  })
})
