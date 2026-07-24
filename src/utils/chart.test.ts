import { describe, it, expect } from 'vitest'
import { ageTicks } from './chart'

describe('ageTicks', () => {
  it('includes the start age, every multiple of 5 after it, and the end age', () => {
    expect(ageTicks(33, 100)).toEqual([
      33, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
    ])
  })

  it('does not duplicate a multiple-of-5 start or end age', () => {
    expect(ageTicks(35, 65)).toEqual([35, 40, 45, 50, 55, 60, 65])
  })

  it('collapses a too-close final candidate into the exact end age', () => {
    // 41 is within 3 of the last multiple-of-5 candidate (40), so 40 is
    // replaced by 41 rather than showing both.
    expect(ageTicks(35, 41)).toEqual([35, 41])
  })

  it('returns just the start age when the range is a single point', () => {
    expect(ageTicks(50, 50)).toEqual([50])
  })
})
