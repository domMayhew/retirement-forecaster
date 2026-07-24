// SPEC: year-to-year rate-of-return variability — seeded, reproducible,
// bounded (but not guaranteed to reach) between worst and best.

import { describe, it, expect } from 'vitest'
import { mulberry32, yearlyReturn, yearlyReturns, randomSeed, clampBounds } from './variability'

describe('mulberry32: seeded PRNG', () => {
  it('is deterministic — the same seed always produces the same sequence', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(12345)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('yearlyReturn: one pseudo-random annual return', () => {
  it('returns exactly the average when best and worst both equal it (no variability)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      expect(yearlyReturn(rng, 0.05, 0.05, 0.05)).toBeCloseTo(0.05, 10)
    }
  })

  it('never falls outside [worst, best]', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 1000; i++) {
      const r = yearlyReturn(rng, 0.05, -0.3, 0.3)
      expect(r).toBeGreaterThanOrEqual(-0.3)
      expect(r).toBeLessThanOrEqual(0.3)
    }
  })

  it('clamps a misconfigured range (best below average) rather than inverting the skew', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      // best (0.01) is below average (0.05) — should behave as if best === average.
      const r = yearlyReturn(rng, 0.05, -0.1, 0.01)
      expect(r).toBeLessThanOrEqual(0.05 + 1e-9)
      expect(r).toBeGreaterThanOrEqual(-0.1)
    }
  })

  it('produces a range of values clustered around the average rather than only the extremes', () => {
    const rng = mulberry32(2024)
    const samples = Array.from({ length: 2000 }, () => yearlyReturn(rng, 0.05, -0.3, 0.3))
    const withinHalfRange = samples.filter((s) => Math.abs(s - 0.05) < 0.15).length
    // A triangular distribution puts most mass near the center — comfortably
    // more than half the samples should land in the inner half of the range.
    expect(withinHalfRange / samples.length).toBeGreaterThan(0.5)
  })
})

describe('yearlyReturns: a reproducible sequence', () => {
  it('produces the same sequence for the same seed', () => {
    const a = yearlyReturns(555, 20, 0.05, -0.2, 0.25)
    const b = yearlyReturns(555, 20, 0.05, -0.2, 0.25)
    expect(a).toEqual(b)
  })

  it('produces a different sequence for a different seed', () => {
    const a = yearlyReturns(1, 20, 0.05, -0.2, 0.25)
    const b = yearlyReturns(2, 20, 0.05, -0.2, 0.25)
    expect(a).not.toEqual(b)
  })

  it('produces exactly `count` values', () => {
    expect(yearlyReturns(1, 30, 0.05, -0.2, 0.25)).toHaveLength(30)
    expect(yearlyReturns(1, 0, 0.05, -0.2, 0.25)).toHaveLength(0)
  })

  it('never returns a negative-length array for a negative count', () => {
    expect(yearlyReturns(1, -5, 0.05, -0.2, 0.25)).toEqual([])
  })
})

describe('randomSeed', () => {
  it('produces an integer', () => {
    expect(Number.isInteger(randomSeed())).toBe(true)
  })
})

describe('clampBounds: keeps worst <= average <= best', () => {
  it('leaves an already-valid range untouched', () => {
    expect(clampBounds(0.05, -0.1, 0.2)).toEqual({ worst: -0.1, best: 0.2 })
  })

  it('leaves the degenerate no-variability case (all equal) untouched', () => {
    expect(clampBounds(0.05, 0.05, 0.05)).toEqual({ worst: 0.05, best: 0.05 })
  })

  it('pulls worst down to average when worst is above it', () => {
    expect(clampBounds(0.05, 0.1, 0.2)).toEqual({ worst: 0.05, best: 0.2 })
  })

  it('pulls best up to average when best is below it', () => {
    expect(clampBounds(0.05, -0.1, 0.02)).toEqual({ worst: -0.1, best: 0.05 })
  })

  it('corrects a fully inverted range (worst above best, both crossing average)', () => {
    expect(clampBounds(0.05, 0.2, -0.1)).toEqual({ worst: 0.05, best: 0.05 })
  })
})
