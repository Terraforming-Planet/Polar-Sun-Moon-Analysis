import { describe, expect, it } from 'vitest'
import { createWgs84EllipsoidScale, latLonToCartesian, WGS84 } from './wgs84'

const closeTo = (actual: number, expected: number, precision = 9) => expect(actual).toBeCloseTo(expected, precision)

describe('latLonToCartesian', () => {
  it('places Greenwich on +Z and 90°E on +X', () => {
    const greenwich = latLonToCartesian(0, 0, { kind: 'sphere', radius: 1 })
    closeTo(greenwich.x, 0)
    closeTo(greenwich.y, 0)
    closeTo(greenwich.z, 1)

    const east = latLonToCartesian(0, 90, { kind: 'sphere', radius: 1 })
    closeTo(east.x, 1)
    closeTo(east.y, 0)
    closeTo(east.z, 0)
  })

  it('places both poles on the Y axis', () => {
    const north = latLonToCartesian(90, 0)
    const south = latLonToCartesian(-90, 0)
    closeTo(north.x, 0)
    expect(north.y).toBeGreaterThan(0)
    closeTo(north.z, 0)
    closeTo(south.x, 0)
    expect(south.y).toBeLessThan(0)
    closeTo(south.z, 0)
  })

  it('maps ±180° to the same anti-Greenwich direction', () => {
    const positive = latLonToCartesian(0, 180, { kind: 'sphere', radius: 1 })
    const negative = latLonToCartesian(0, -180, { kind: 'sphere', radius: 1 })
    closeTo(positive.x, negative.x)
    closeTo(positive.y, negative.y)
    closeTo(positive.z, -1)
    closeTo(negative.z, -1)
  })

  it.each([
    ['London', 51.5074, -0.1278],
    ['Warsaw', 52.2297, 21.0122],
    ['Cairo', 30.0444, 31.2357],
    ['Cape Town', -33.9249, 18.4241],
    ['Tokyo', 35.6762, 139.6503],
    ['Sydney', -33.8688, 151.2093],
    ['New York', 40.7128, -74.006],
  ])('returns a finite WGS84 position for %s', (_name, latitude, longitude) => {
    const point = latLonToCartesian(latitude, longitude)
    expect(Number.isFinite(point.x)).toBe(true)
    expect(Number.isFinite(point.y)).toBe(true)
    expect(Number.isFinite(point.z)).toBe(true)
  })

  it('rejects coordinates outside the geographic range', () => {
    expect(() => latLonToCartesian(91, 0)).toThrow(RangeError)
    expect(() => latLonToCartesian(0, 181)).toThrow(RangeError)
  })
})

describe('WGS84 ellipsoid', () => {
  it('uses the official equatorial and polar radii', () => {
    expect(WGS84.semiMajorAxisM).toBe(6_378_137)
    expect(WGS84.semiMinorAxisM).toBeCloseTo(6_356_752.314245, 6)
    expect(WGS84.inverseFlattening).toBeCloseTo(298.257223563, 9)
  })

  it('creates the correct Three.js axis scale', () => {
    const scale = createWgs84EllipsoidScale(1)
    closeTo(scale.x, 1)
    closeTo(scale.z, 1)
    closeTo(scale.y, WGS84.semiMinorAxisM / WGS84.semiMajorAxisM)
  })
})
