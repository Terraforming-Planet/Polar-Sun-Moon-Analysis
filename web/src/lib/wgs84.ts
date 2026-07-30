import { Vector3 } from 'three'

export const WGS84 = {
  semiMajorAxisM: 6_378_137,
  semiMinorAxisM: 6_356_752.314245,
  inverseFlattening: 298.257223563,
} as const

export type EarthShape =
  | { kind: 'sphere'; radius: number }
  | { kind: 'wgs84'; scale?: number }

function assertLatitude(latitudeDeg: number): void {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new RangeError(`Latitude must be within [-90, 90], received ${latitudeDeg}`)
  }
}

function assertLongitude(longitudeDeg: number): void {
  if (!Number.isFinite(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 180) {
    throw new RangeError(`Longitude must be within [-180, 180], received ${longitudeDeg}`)
  }
}

/**
 * Converts geodetic latitude/longitude to the Three.js coordinate system used
 * by the scientific Earth model: +Y north, +Z at Greenwich, +X at 90°E.
 */
export function latLonToCartesian(
  latitudeDeg: number,
  longitudeDeg: number,
  shape: EarthShape = { kind: 'wgs84', scale: 1 / WGS84.semiMajorAxisM },
): Vector3 {
  assertLatitude(latitudeDeg)
  assertLongitude(longitudeDeg)

  const latitude = latitudeDeg * Math.PI / 180
  const longitude = longitudeDeg * Math.PI / 180

  if (shape.kind === 'sphere') {
    const cosLatitude = Math.cos(latitude)
    return new Vector3(
      shape.radius * cosLatitude * Math.sin(longitude),
      shape.radius * Math.sin(latitude),
      shape.radius * cosLatitude * Math.cos(longitude),
    )
  }

  const scale = shape.scale ?? 1 / WGS84.semiMajorAxisM
  const a = WGS84.semiMajorAxisM
  const b = WGS84.semiMinorAxisM
  const eccentricitySquared = 1 - (b * b) / (a * a)
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const primeVerticalRadius = a / Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude)

  return new Vector3(
    primeVerticalRadius * cosLatitude * Math.sin(longitude) * scale,
    (primeVerticalRadius * (1 - eccentricitySquared)) * sinLatitude * scale,
    primeVerticalRadius * cosLatitude * Math.cos(longitude) * scale,
  )
}

export function createWgs84EllipsoidScale(radius = 1): Vector3 {
  return new Vector3(radius, radius * WGS84.semiMinorAxisM / WGS84.semiMajorAxisM, radius)
}
