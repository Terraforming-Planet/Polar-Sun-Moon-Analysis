import { describe, expect, it } from 'vitest'
import { EARTH_VIEW_PRESETS, getEarthViewPreset } from './earthViewPresets'

describe('scientific Earth camera presets', () => {
  it('keeps every preset inside valid geodetic bounds', () => {
    for (const preset of EARTH_VIEW_PRESETS) {
      expect(preset.latitude).toBeGreaterThanOrEqual(-90)
      expect(preset.latitude).toBeLessThanOrEqual(90)
      expect(preset.longitude).toBeGreaterThanOrEqual(-180)
      expect(preset.longitude).toBeLessThanOrEqual(180)
      expect(preset.heightM).toBeGreaterThan(0)
    }
  })

  it('contains explicit north and south pole views', () => {
    expect(getEarthViewPreset('north-pole').latitude).toBe(90)
    expect(getEarthViewPreset('south-pole').latitude).toBe(-90)
  })

  it('uses unique identifiers', () => {
    const ids = EARTH_VIEW_PRESETS.map(preset => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
