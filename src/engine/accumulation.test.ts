// SPEC: Accumulation phase — one year of saving.
//
// Growth-timing convention under test: "flow first, then grow."
//   end-of-year balance = (start balance + contribution) * (1 + rateOfReturn)
// so a year's contributions earn a full year of growth.

import { describe, it, expect } from 'vitest'
import { computeAccumulationYear } from './forecast'
import type { SavingsPlanSegment } from './types'

// A helper to build a plan segment with sensible fields; override per test.
function segment(over: Partial<SavingsPlanSegment> = {}): SavingsPlanSegment {
  return {
    id: 's1',
    monthlyRRSP: 0,
    monthlyTFSA: 0,
    refundReinvestFraction: 1.0,
    untilAge: 65,
    ...over,
  }
}

describe('Accumulation: RRSP contributions and the reinvested tax refund', () => {
  it('turns $1,000/month RRSP into a $15,000 contribution at a 25% tax rate (full refund reinvested)', () => {
    // base = 1000 * 12               = 12,000
    // refund = 12,000 * 0.25         =  3,000
    // reinvested (fraction 1.0)      =  3,000
    // total RRSP contribution        = 15,000
    const result = computeAccumulationYear(
      /* startRRSP */ 0,
      /* startTFSA */ 0,
      segment({ monthlyRRSP: 1000 }),
      /* incomeTaxRate */ 0.25,
      /* rateOfReturn */ 0,
    )
    expect(result.rrspContribution).toBe(15000)
  })

  it('grows the year-end RRSP by the full rate of return: $15,000 contribution at 10% -> $16,500', () => {
    // (0 + 15,000) * 1.10 = 16,500
    const result = computeAccumulationYear(0, 0, segment({ monthlyRRSP: 1000 }), 0.25, 0.10)
    expect(result.rrsp).toBe(16500)
  })

  it('grows an existing balance plus the new contribution: start $16,500 + $15,000 at 10% -> $34,650', () => {
    // (16,500 + 15,000) * 1.10 = 31,500 * 1.10 = 34,650
    const result = computeAccumulationYear(16500, 0, segment({ monthlyRRSP: 1000 }), 0.25, 0.10)
    expect(result.rrsp).toBe(34650)
  })

  it('only reinvests the chosen fraction of the refund: fraction 0.5 -> $13,500 contribution', () => {
    // base 12,000; refund 3,000; reinvest 0.5 -> 1,500; total 13,500
    const result = computeAccumulationYear(
      0, 0,
      segment({ monthlyRRSP: 1000, refundReinvestFraction: 0.5 }),
      0.25, 0,
    )
    expect(result.rrspContribution).toBe(13500)
  })
})

describe('Accumulation: TFSA contributions', () => {
  it('has no refund mechanic: $500/month TFSA is a plain $6,000 contribution', () => {
    const result = computeAccumulationYear(0, 0, segment({ monthlyTFSA: 500 }), 0.25, 0)
    expect(result.tfsaContribution).toBe(6000)
  })

  it('grows the TFSA by the rate of return: $6,000 at 10% -> $6,600', () => {
    // (0 + 6,000) * 1.10 = 6,600
    const result = computeAccumulationYear(0, 0, segment({ monthlyTFSA: 500 }), 0.25, 0.10)
    expect(result.tfsa).toBeCloseTo(6600, 6)
  })
})

describe('Accumulation: RRSP and TFSA are tracked independently', () => {
  it('computes both accounts in the same year without cross-contamination', () => {
    // RRSP: (0 + 15,000) * 1.10 = 16,500
    // TFSA: (0 +  6,000) * 1.10 =  6,600
    const result = computeAccumulationYear(
      0, 0,
      segment({ monthlyRRSP: 1000, monthlyTFSA: 500 }),
      0.25, 0.10,
    )
    expect(result.rrsp).toBeCloseTo(16500, 6)
    expect(result.tfsa).toBeCloseTo(6600, 6)
    expect(result.rrspContribution).toBe(15000)
    expect(result.tfsaContribution).toBe(6000)
  })
})
