import { describe, expect, it } from 'vitest'

import {
  analysisRadiusForHeightKm,
  heightKmToSliderPosition,
  MAX_OBSERVATION_HEIGHT_KM,
  MIN_OBSERVATION_HEIGHT_KM,
  observationFootprintRadiusKm,
  OBSERVATION_SLIDER_STEPS,
  sliderPositionToHeightKm,
} from './observationHeightEnhancement'

describe('observation height scale', () => {
  it('maps the full logarithmic slider to 1..25000 km', () => {
    expect(sliderPositionToHeightKm(0)).toBe(MIN_OBSERVATION_HEIGHT_KM)
    expect(sliderPositionToHeightKm(OBSERVATION_SLIDER_STEPS)).toBe(MAX_OBSERVATION_HEIGHT_KM)
    expect(heightKmToSliderPosition(MIN_OBSERVATION_HEIGHT_KM)).toBe(0)
    expect(heightKmToSliderPosition(MAX_OBSERVATION_HEIGHT_KM)).toBe(OBSERVATION_SLIDER_STEPS)
  })

  it('keeps low heights usable and produces a wide but horizon-limited 25000 km footprint', () => {
    expect(observationFootprintRadiusKm(1)).toBe(1)
    expect(observationFootprintRadiusKm(25)).toBeGreaterThan(10)
    expect(observationFootprintRadiusKm(25_000)).toBeGreaterThan(8_000)
    expect(observationFootprintRadiusKm(25_000)).toBeLessThan(9_000)
  })

  it('caps high-detail AI radius at 500 km even when the requested camera view is much wider', () => {
    expect(analysisRadiusForHeightKm(25_000)).toBe(500)
    expect(analysisRadiusForHeightKm(20)).toBeLessThan(20)
  })
})
