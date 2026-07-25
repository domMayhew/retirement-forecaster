// SPEC: incomeTaxOwed / marginalTaxRate — simplified progressive federal +
// provincial bracket tax (no credits/deductions), 2024 figures.

import { describe, it, expect } from 'vitest'
import { incomeTaxOwed, marginalTaxRate } from './tax'

describe('incomeTaxOwed: zero/negative income', () => {
  it('owes nothing at zero income', () => {
    expect(incomeTaxOwed(0, 'BC')).toBe(0)
    expect(incomeTaxOwed(0, 'AB')).toBe(0)
  })

  it('owes nothing at negative income (never happens in practice, but should not throw or go negative)', () => {
    expect(incomeTaxOwed(-100, 'BC')).toBe(0)
  })
})

describe('incomeTaxOwed: BC, hand-checked across several federal and BC bracket boundaries', () => {
  it('taxes $60,000 correctly (crosses into the 2nd federal bracket and 2nd BC bracket)', () => {
    // Federal: 55,867 * 0.15 + (60,000 - 55,867) * 0.205 = 8,380.05 + 847.265 = 9,227.315
    // BC:      47,937 * 0.0506 + (60,000 - 47,937) * 0.077 = 2,425.6122 + 928.851 = 3,354.4632
    // Total = 12,581.7782
    expect(incomeTaxOwed(60000, 'BC')).toBeCloseTo(12581.7782, 4)
  })

  it('taxes exactly at the first BC bracket threshold (47,937) using only the first BC bracket', () => {
    // Federal: still entirely in the first bracket (47,937 < 55,867) -> 47,937 * 0.15 = 7,190.55
    // BC: 47,937 * 0.0506 = 2,425.6122
    // Total = 9,616.1622
    expect(incomeTaxOwed(47937, 'BC')).toBeCloseTo(9616.1622, 4)
  })
})

describe('incomeTaxOwed: AB, hand-checked across several federal and AB bracket boundaries', () => {
  it('taxes $200,000 correctly (crosses into the 4th federal bracket and 3rd AB bracket)', () => {
    // Federal: 55,867*0.15 + (111,733-55,867)*0.205 + (173,205-111,733)*0.26 + (200,000-173,205)*0.29
    //        = 8,380.05 + 11,452.53 + 15,982.72 + 7,770.55 = 43,585.85
    // AB: 148,269*0.10 + (177,922-148,269)*0.12 + (200,000-177,922)*0.13
    //   = 14,826.9 + 3,558.36 + 2,870.14 = 21,255.4
    // Total = 64,841.25
    expect(incomeTaxOwed(200000, 'AB')).toBeCloseTo(64841.25, 2)
  })
})

describe('incomeTaxOwed: is strictly increasing (more income never means less tax)', () => {
  it('owes more tax at higher income, for both provinces', () => {
    for (const province of ['BC', 'AB'] as const) {
      const incomes = [0, 10000, 55867, 95875, 150000, 250000, 500000]
      for (let i = 1; i < incomes.length; i++) {
        expect(incomeTaxOwed(incomes[i], province)).toBeGreaterThan(
          incomeTaxOwed(incomes[i - 1], province),
        )
      }
    }
  })
})

describe('marginalTaxRate: the combined rate on the next dollar earned', () => {
  it('matches the hand-checked combined marginal rate at $60,000 in BC (20.5% federal + 7.7% BC)', () => {
    expect(marginalTaxRate(60000, 'BC')).toBeCloseTo(0.282, 6)
  })

  it('matches the hand-checked combined marginal rate at $200,000 in AB (29% federal + 13% AB)', () => {
    expect(marginalTaxRate(200000, 'AB')).toBeCloseTo(0.42, 6)
  })

  it('is the lowest combined bracket rate at zero income', () => {
    expect(marginalTaxRate(0, 'BC')).toBeCloseTo(0.15 + 0.0506, 6)
    expect(marginalTaxRate(0, 'AB')).toBeCloseTo(0.15 + 0.1, 6)
  })

  it('jumps up right after crossing a bracket threshold', () => {
    const justBelow = marginalTaxRate(47937, 'BC')
    const justAbove = marginalTaxRate(47937.01, 'BC')
    expect(justAbove).toBeGreaterThan(justBelow)
  })

  it('never decreases as income rises (each bracket rate is >= the previous)', () => {
    for (const province of ['BC', 'AB'] as const) {
      const incomes = [0, 50000, 100000, 150000, 200000, 300000, 500000]
      for (let i = 1; i < incomes.length; i++) {
        expect(marginalTaxRate(incomes[i], province)).toBeGreaterThanOrEqual(
          marginalTaxRate(incomes[i - 1], province),
        )
      }
    }
  })
})
