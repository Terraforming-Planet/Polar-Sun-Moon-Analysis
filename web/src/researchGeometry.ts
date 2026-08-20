export type ResearchAreaShape = 'circle' | 'square' | 'triangle'

export type ResearchPoint = {
  latitude: number
  longitude: number
}

export type ResearchBounds = {
  west: number
  south: number
  east: number
  north: number
}

const EARTH_RADIUS_KM = 6371.0088
const KM_PER_DEGREE_LATITUDE = 111.32

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function longitudeScale(latitude: number) {
  return Math.max(0.08, Math.cos(latitude * Math.PI / 180))
}

export function researchAreaOffsets(latitude: number, radiusKm: number) {
  const latitudeDelta = radiusKm / KM_PER_DEGREE_LATITUDE
  const longitudeDelta = radiusKm / (KM_PER_DEGREE_LATITUDE * longitudeScale(latitude))
  return { latitudeDelta, longitudeDelta }
}

export function researchAreaBounds(latitude: number, longitude: number, radiusKm: number): ResearchBounds {
  const { latitudeDelta, longitudeDelta } = researchAreaOffsets(latitude, radiusKm)
  return {
    west: clamp(longitude - longitudeDelta, -180, 180),
    south: clamp(latitude - latitudeDelta, -90, 90),
    east: clamp(longitude + longitudeDelta, -180, 180),
    north: clamp(latitude + latitudeDelta, -90, 90),
  }
}

export function researchAreaPolygon(latitude: number, longitude: number, radiusKm: number, shape: ResearchAreaShape): ResearchPoint[] {
  const { latitudeDelta, longitudeDelta } = researchAreaOffsets(latitude, radiusKm)
  if (shape === 'triangle') {
    return [
      { latitude: clamp(latitude + latitudeDelta, -90, 90), longitude },
      { latitude: clamp(latitude - latitudeDelta, -90, 90), longitude: clamp(longitude - longitudeDelta, -180, 180) },
      { latitude: clamp(latitude - latitudeDelta, -90, 90), longitude: clamp(longitude + longitudeDelta, -180, 180) },
    ]
  }
  return [
    { latitude: clamp(latitude + latitudeDelta, -90, 90), longitude: clamp(longitude - longitudeDelta, -180, 180) },
    { latitude: clamp(latitude + latitudeDelta, -90, 90), longitude: clamp(longitude + longitudeDelta, -180, 180) },
    { latitude: clamp(latitude - latitudeDelta, -90, 90), longitude: clamp(longitude + longitudeDelta, -180, 180) },
    { latitude: clamp(latitude - latitudeDelta, -90, 90), longitude: clamp(longitude - longitudeDelta, -180, 180) },
  ]
}

export function haversineDistanceKm(a: ResearchPoint, b: ResearchPoint) {
  const toRadians = (value: number) => value * Math.PI / 180
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const deltaLat = toRadians(b.latitude - a.latitude)
  const deltaLon = toRadians(b.longitude - a.longitude)
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function signedArea(point: ResearchPoint, a: ResearchPoint, b: ResearchPoint) {
  return (point.longitude - b.longitude) * (a.latitude - b.latitude)
    - (a.longitude - b.longitude) * (point.latitude - b.latitude)
}

function pointInTriangle(point: ResearchPoint, vertices: ResearchPoint[]) {
  const [a, b, c] = vertices
  const d1 = signedArea(point, a, b)
  const d2 = signedArea(point, b, c)
  const d3 = signedArea(point, c, a)
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

export function pointInResearchArea(
  point: ResearchPoint,
  center: ResearchPoint,
  radiusKm: number,
  shape: ResearchAreaShape,
) {
  if (shape === 'circle') return haversineDistanceKm(point, center) <= radiusKm
  const bounds = researchAreaBounds(center.latitude, center.longitude, radiusKm)
  if (shape === 'square') {
    return point.longitude >= bounds.west
      && point.longitude <= bounds.east
      && point.latitude >= bounds.south
      && point.latitude <= bounds.north
  }
  return pointInTriangle(point, researchAreaPolygon(center.latitude, center.longitude, radiusKm, 'triangle'))
}

export function researchShapeLabel(shape: ResearchAreaShape) {
  if (shape === 'square') return 'square'
  if (shape === 'triangle') return 'triangle'
  return 'circle'
}
