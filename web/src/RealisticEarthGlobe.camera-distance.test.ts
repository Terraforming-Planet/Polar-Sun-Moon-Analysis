import { describe, expect, it } from 'vitest'

const ORBIT_CONTROLS_MIN_DISTANCE = 2.05

const CAMERA_PRESET_POSITIONS = {
  full: [0, 0.18, 6.1],
  moon: [0, 0.12, 12.5],
  greenwich: [0, 0.15, 5.4],
  dateline: [0, 0.15, -5.4],
  north: [0, 6.2, 0.01],
  south: [0, -6.2, 0.01],
} as const

describe('RealisticEarthGlobe camera preset safety', () => {
  it('keeps every declared preset outside the globe and OrbitControls minimum distance', () => {
    for (const [name, position] of Object.entries(CAMERA_PRESET_POSITIONS)) {
      const distance = Math.hypot(...position)

      expect(Number.isFinite(distance), `${name} should use finite coordinates`).toBe(true)
      expect(
        distance,
        `${name} should remain outside controls.minDistance to avoid an inside-globe or clipped reset`,
      ).toBeGreaterThan(ORBIT_CONTROLS_MIN_DISTANCE)
    }
  })
})
