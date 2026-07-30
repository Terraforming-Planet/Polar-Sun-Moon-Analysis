import { describe, expect, it } from 'vitest'

function positionFromLatLon(latitude: number, longitude: number, radius: number) {
  const phi = (90 - latitude) * Math.PI / 180
  const theta = (longitude + 180) * Math.PI / 180
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }
}

describe('stable Earth marker coordinates', () => {
  it('places both poles on the vertical axis', () => {
    const north = positionFromLatLon(90, 0, 2)
    const south = positionFromLatLon(-90, 0, 2)
    expect(north.y).toBeCloseTo(2)
    expect(south.y).toBeCloseTo(-2)
    expect(north.x).toBeCloseTo(0)
    expect(south.x).toBeCloseTo(0)
  })

  it('keeps equatorial markers on the Earth radius', () => {
    const point = positionFromLatLon(0, 30, 2)
    expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(2)
  })
})
