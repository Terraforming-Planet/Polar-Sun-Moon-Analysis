export type SatelliteSourceId = 'nasa-gibs' | 'sentinel-2' | 'sentinel-1' | 'local-ortho'
export type SatelliteSourceMode = 'auto' | SatelliteSourceId

export type SatelliteSource = {
  id: SatelliteSourceId
  label: string
  provider: string
  product: string
  minZoom: number
  maxZoom: number
  resolutionMeters: number
  cloudIndependent: boolean
  nearRealTime: boolean
  availability: 'global' | 'regional' | 'local'
  description: string
}

export type SourceContext = {
  zoom: number
  cloudCoverPercent?: number | null
  ageHours?: number | null
  hasCoverage?: boolean
  mobile?: boolean
  floodMode?: boolean
}

export type SourceObservation = {
  observedAtUtc?: string | null
  cloudCoverPercent?: number | null
  hasCoverage?: boolean
  tilesConnected?: boolean
}

export type SatelliteSourceStatus = {
  source: string
  product: string
  observationTime: string
  age: string
  resolution: string
  cloudCover: string
  coverage: string
  rendering: string
}

export const SATELLITE_SOURCES: SatelliteSource[] = [
  {
    id: 'nasa-gibs',
    label: 'NASA GIBS',
    provider: 'NASA Earthdata',
    product: 'Global imagery / NRT layers',
    minZoom: 0,
    maxZoom: 7,
    resolutionMeters: 250,
    cloudIndependent: false,
    nearRealTime: true,
    availability: 'global',
    description: 'Complete Earth disk, continents and global time-aware layers.',
  },
  {
    id: 'sentinel-2',
    label: 'Sentinel-2 L2A',
    provider: 'Copernicus Data Space',
    product: 'Surface reflectance',
    minZoom: 6,
    maxZoom: 15,
    resolutionMeters: 10,
    cloudIndependent: false,
    nearRealTime: false,
    availability: 'regional',
    description: 'High-detail regional optical imagery when cloud cover is sufficiently low.',
  },
  {
    id: 'sentinel-1',
    label: 'Sentinel-1 GRD',
    provider: 'Copernicus Data Space',
    product: 'Radar SAR',
    minZoom: 5,
    maxZoom: 15,
    resolutionMeters: 10,
    cloudIndependent: true,
    nearRealTime: false,
    availability: 'regional',
    description: 'Radar through clouds; prioritized for floods and wet-terrain analysis.',
  },
  {
    id: 'local-ortho',
    label: 'Local orthophoto',
    provider: 'Official local provider',
    product: 'Ortho / aerial imagery',
    minZoom: 14,
    maxZoom: 22,
    resolutionMeters: 0.25,
    cloudIndependent: false,
    nearRealTime: false,
    availability: 'local',
    description: 'Highest detail where a legal official local source is available.',
  },
]

function score(source: SatelliteSource, context: SourceContext): number {
  if (context.hasCoverage === false && source.availability !== 'global') return Number.NEGATIVE_INFINITY
  if (context.zoom < source.minZoom - 1 || context.zoom > source.maxZoom + 2) return Number.NEGATIVE_INFINITY

  let value = 100
  const center = (source.minZoom + source.maxZoom) / 2
  value -= Math.abs(context.zoom - center) * 4
  value -= Math.log10(Math.max(0.1, source.resolutionMeters)) * 7

  if (context.floodMode) value += source.id === 'sentinel-1' ? 90 : -20
  if ((context.cloudCoverPercent ?? 0) > 35) value += source.cloudIndependent ? 45 : -55
  if ((context.ageHours ?? 0) > 72 && source.nearRealTime) value += 18
  if (context.mobile && source.availability === 'local') value -= 15
  if (context.zoom <= 5 && source.id === 'nasa-gibs') value += 70
  if (context.zoom >= 7 && context.zoom < 14 && source.id === 'sentinel-2') value += 35
  if (context.zoom >= 15 && source.id === 'local-ortho') value += 60

  return value
}

export function chooseSatelliteSource(context: SourceContext): SatelliteSource {
  const ranked = SATELLITE_SOURCES
    .map(source => ({ source, score: score(source, context) }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.source ?? SATELLITE_SOURCES[0]
}

export function sourceForMode(mode: SatelliteSourceMode, context: SourceContext): SatelliteSource {
  if (mode === 'auto') return chooseSatelliteSource(context)
  return SATELLITE_SOURCES.find(source => source.id === mode) ?? chooseSatelliteSource(context)
}

export function formatSatelliteSourceStatus(
  source: SatelliteSource,
  observation: SourceObservation = {},
  nowMs = Date.now(),
): SatelliteSourceStatus {
  const observedMs = observation.observedAtUtc ? Date.parse(observation.observedAtUtc) : Number.NaN
  const ageHours = Number.isFinite(observedMs) ? Math.max(0, (nowMs - observedMs) / 3_600_000) : null
  const cloudCover = observation.cloudCoverPercent

  return {
    source: `${source.label} · ${source.provider}`,
    product: source.product,
    observationTime: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : 'observation time unavailable',
    age: ageHours === null ? 'age unknown' : ageHours < 1 ? `${Math.round(ageHours * 60)} min` : `${ageHours.toFixed(1)} h`,
    resolution: `about ${source.resolutionMeters} m/pixel`,
    cloudCover: source.cloudIndependent
      ? 'cloud-independent'
      : Number.isFinite(cloudCover)
        ? `${Math.max(0, Math.min(100, cloudCover as number)).toFixed(0)}%`
        : 'cloud-cover metadata unavailable',
    coverage: observation.hasCoverage === false ? 'no coverage for selected area' : observation.hasCoverage === true ? 'coverage confirmed' : 'coverage not verified',
    rendering: observation.tilesConnected ? 'source tiles are connected' : 'selected source — renderer still uses the 2K base texture',
  }
}

export function zoomLevelFromDistance(
  distanceFromCenter: number,
  earthRadius = 2,
  mobile = false,
): number {
  if (!Number.isFinite(distanceFromCenter) || !Number.isFinite(earthRadius) || earthRadius <= 0) return 0

  const altitude = Math.max(distanceFromCenter - earthRadius, earthRadius / 4096)
  const normalizedAltitude = altitude / earthRadius
  const rawZoom = Math.round(8 - 2 * Math.log2(normalizedAltitude))
  const maximumZoom = mobile ? 16 : 22

  return Math.max(0, Math.min(maximumZoom, rawZoom))
}
