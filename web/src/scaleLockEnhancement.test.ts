import { describe, expect, it } from 'vitest'

import { lockedStudyRadiusKm } from './scaleLockEnhancement'
import { analysisRadiusForHeightKm } from './observationHeightEnhancement'

describe('terrain study scale lock', () => {
  it('uses one radius derived from the selected observation height', () => {
    expect(lockedStudyRadiusKm(100)).toBe(Number(analysisRadiusForHeightKm(100).toFixed(2)))
    expect(lockedStudyRadiusKm(100)).toBeGreaterThan(50)
    expect(lockedStudyRadiusKm(100)).toBeLessThan(60)
  })

  it('keeps the detailed-analysis radius capped for extremely wide views', () => {
    expect(lockedStudyRadiusKm(25_000)).toBe(500)
  })
})
