import { describe, expect, it } from 'vitest'
import { createWgs84EllipsoidScale, latLonToCartesian } from './lib/wgs84'

describe('stable Earth geometry', () => {
  it('keeps legacy markers on a sphere', () => {
    const point = latLonToCartesian(0, 30, { kind: 'sphere', radius: 2 })
    expect(point.length()).toBeCloseTo(2)
  })

  it('uses a flattened WGS84 scientific model', () => {
    const scale = createWgs84EllipsoidScale(1)
    expect(scale.x).toBe(1)
    expect(scale.z).toBe(1)
    expect(scale.y).toBeLessThan(1)
  })

  it('places both poles on the vertical axis', () => {
    const north = latLonToCartesian(90, 0, { kind: 'sphere', radius: 2 })
    const south = latLonToCartesian(-90, 0, { kind: 'sphere', radius: 2 })
    expect(north.y).toBeCloseTo(2)
    expect(south.y).toBeCloseTo(-2)
    expect(north.x).toBeCloseTo(0)
    expect(south.x).toBeCloseTo(0)
  })
})
