export type ViewerPhase = 'loading' | 'ready' | 'fallback-ready' | 'error'

export type ViewerState = {
  requestKey: string
  candidateIndex: number
  phase: ViewerPhase
  hasImagery: boolean
}

export type ViewerImageEvent = {
  type: 'loaded' | 'failed'
  requestKey: string
  candidateIndex: number
}

export function createViewerState(requestKey: string): ViewerState {
  return {
    requestKey,
    candidateIndex: 0,
    phase: 'loading',
    hasImagery: false,
  }
}

export function applyViewerImageEvent(
  state: ViewerState,
  event: ViewerImageEvent,
  candidateCount: number,
): ViewerState {
  if (event.requestKey !== state.requestKey || event.candidateIndex !== state.candidateIndex) {
    return state
  }

  if (event.type === 'loaded') {
    return {
      ...state,
      phase: state.candidateIndex === 0 ? 'ready' : 'fallback-ready',
      hasImagery: true,
    }
  }

  if (state.candidateIndex + 1 < candidateCount) {
    return {
      ...state,
      candidateIndex: state.candidateIndex + 1,
      phase: 'loading',
      hasImagery: false,
    }
  }

  return {
    ...state,
    phase: 'fallback-ready',
    hasImagery: false,
  }
}

export function markViewerFallbackError(state: ViewerState, requestKey: string): ViewerState {
  if (state.requestKey !== requestKey || state.hasImagery) return state
  return { ...state, phase: 'error' }
}

export function viewerPhaseLabel(phase: ViewerPhase) {
  if (phase === 'ready') return 'READY'
  if (phase === 'fallback-ready') return 'FALLBACK READY'
  if (phase === 'error') return 'ERROR'
  return 'LOADING'
}

export type RiverPoint = { latitude: number; longitude: number }

export type RiverBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type RiverCandidate = {
  id: string
  name: string
  points: RiverPoint[]
  lengthKm: number
  source: 'osm' | 'natural-earth'
  sourceLabel: string
  topologyDownstream: boolean
}

export type DirectedRiver = RiverCandidate & {
  directionSource: 'dem' | 'topology'
}

type OverpassElement = {
  id?: unknown
  tags?: Record<string, unknown>
  geometry?: Array<{ lat?: unknown; lon?: unknown }>
}

type NaturalEarthFeature = {
  id?: unknown
  properties?: Record<string, unknown>
  geometry?: {
    type?: unknown
    coordinates?: unknown
  }
}

function toRadians(value: number) {
  return value * Math.PI / 180
}

export function riverSegmentKm(a: RiverPoint, b: RiverPoint) {
  const radiusKm = 6371.0088
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function riverLengthKm(points: RiverPoint[]) {
  return points.slice(1).reduce(
    (total, point, index) => total + riverSegmentKm(points[index], point),
    0,
  )
}

export function sampleRiverLine(points: RiverPoint[], count: number) {
  if (points.length < 2 || count < 2) return points.slice()
  const segmentLengths = points.slice(1).map((point, index) => riverSegmentKm(points[index], point))
  const total = segmentLengths.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return [points[0], points[points.length - 1]]

  const samples: RiverPoint[] = []
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const target = total * sampleIndex / (count - 1)
    let travelled = 0
    let segmentIndex = 0
    while (
      segmentIndex < segmentLengths.length - 1
      && travelled + segmentLengths[segmentIndex] < target
    ) {
      travelled += segmentLengths[segmentIndex]
      segmentIndex += 1
    }
    const length = Math.max(1e-9, segmentLengths[segmentIndex])
    const fraction = Math.min(1, Math.max(0, (target - travelled) / length))
    const start = points[segmentIndex]
    const end = points[segmentIndex + 1]
    samples.push({
      latitude: start.latitude + (end.latitude - start.latitude) * fraction,
      longitude: start.longitude + (end.longitude - start.longitude) * fraction,
    })
  }
  return samples
}

function finitePoint(latitude: unknown, longitude: unknown): RiverPoint | null {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: lat, longitude: lon }
}

export function selectMainMediumOsmRivers(payload: unknown, maxRivers = 24): RiverCandidate[] {
  const elements = Array.isArray((payload as { elements?: unknown[] })?.elements)
    ? ((payload as { elements: OverpassElement[] }).elements)
    : []
  const rivers: RiverCandidate[] = []

  for (const element of elements) {
    if (element?.tags?.waterway !== 'river') continue
    if (!Array.isArray(element.geometry)) continue
    const points = element.geometry
      .map(point => finitePoint(point.lat, point.lon))
      .filter((point): point is RiverPoint => point !== null)
    if (points.length < 2) continue
    const lengthKm = riverLengthKm(points)
    if (lengthKm < 0.25) continue
    const name = typeof element.tags?.name === 'string'
      ? element.tags.name
      : `River way ${String(element.id ?? 'unknown')}`
    rivers.push({
      id: `osm-${String(element.id ?? rivers.length)}`,
      name,
      points,
      lengthKm,
      source: 'osm',
      sourceLabel: 'OpenStreetMap waterway=river topology',
      topologyDownstream: true,
    })
  }

  return rivers
    .sort((a, b) => b.lengthKm - a.lengthKm)
    .slice(0, Math.max(1, maxRivers))
}

function pointInBounds(point: RiverPoint, bounds: RiverBounds) {
  return point.longitude >= bounds.west
    && point.longitude <= bounds.east
    && point.latitude >= bounds.south
    && point.latitude <= bounds.north
}

function coordinatesToLines(value: unknown, geometryType: unknown): number[][][] {
  if (geometryType === 'LineString' && Array.isArray(value)) return [value as number[][]]
  if (geometryType === 'MultiLineString' && Array.isArray(value)) return value as number[][][]
  return []
}

export function selectMainMediumNaturalEarthRivers(
  payload: unknown,
  bounds: RiverBounds,
  maxRivers = 18,
): RiverCandidate[] {
  const features = Array.isArray((payload as { features?: unknown[] })?.features)
    ? ((payload as { features: NaturalEarthFeature[] }).features)
    : []
  const rivers: Array<RiverCandidate & { scaleRank: number }> = []

  for (const feature of features) {
    const scaleRank = Number(feature?.properties?.scalerank ?? 99)
    if (!Number.isFinite(scaleRank) || scaleRank > 6) continue
    const lines = coordinatesToLines(feature?.geometry?.coordinates, feature?.geometry?.type)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const points = lines[lineIndex]
        .map(pair => finitePoint(pair?.[1], pair?.[0]))
        .filter((point): point is RiverPoint => point !== null)
      if (points.length < 2 || !points.some(point => pointInBounds(point, bounds))) continue
      const lengthKm = riverLengthKm(points)
      if (lengthKm < 1) continue
      const rawName = feature?.properties?.name_en ?? feature?.properties?.name
      const name = typeof rawName === 'string' && rawName.trim()
        ? rawName
        : `Natural Earth river ${String(feature.id ?? rivers.length)}`
      rivers.push({
        id: `natural-earth-${String(feature.id ?? rivers.length)}-${lineIndex}`,
        name,
        points,
        lengthKm,
        source: 'natural-earth',
        sourceLabel: 'Natural Earth 1:50m major river geometry',
        topologyDownstream: false,
        scaleRank,
      })
    }
  }

  return rivers
    .sort((a, b) => a.scaleRank - b.scaleRank || b.lengthKm - a.lengthKm)
    .slice(0, Math.max(1, maxRivers))
    .map(({ scaleRank: _scaleRank, ...river }) => river)
}

export function orientRiverCandidate(
  candidate: RiverCandidate,
  elevationSamples: number[],
  minimumDropMetres = 0.75,
): DirectedRiver | null {
  const finiteElevations = elevationSamples.filter(value => Number.isFinite(value))
  if (finiteElevations.length >= 2) {
    const first = finiteElevations[0]
    const last = finiteElevations[finiteElevations.length - 1]
    const drop = first - last
    if (drop >= minimumDropMetres) {
      return { ...candidate, points: candidate.points.slice(), directionSource: 'dem' }
    }
    if (drop <= -minimumDropMetres) {
      return {
        ...candidate,
        points: candidate.points.slice().reverse(),
        directionSource: 'dem',
      }
    }
  }

  if (candidate.topologyDownstream) {
    return { ...candidate, points: candidate.points.slice(), directionSource: 'topology' }
  }

  return null
}
