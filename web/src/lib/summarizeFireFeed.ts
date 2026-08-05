import { normalizeHazardCategories } from './normalizeHazardCategories'

export type FireFeedFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: {
    categories?: unknown
    observation_time?: unknown
    observationUtc?: unknown
    source?: unknown
  } | null
}

export type FireFeedData = {
  generated_at_utc?: unknown
  generatedUtc?: unknown
  features?: unknown
}

export type FireFeedSummary = {
  pointCount: number
  sourceLabels?: string[]
  publishedAt: string | null
  latestObservationAt: string | null
  publishedAgeHours: number | null
  latestObservationAgeHours: number | null
  publishedInFuture: boolean
  publicationTimestampInvalid?: boolean
  ignoredObservationTimestampCount?: number
}

const FIRE_CATEGORIES = new Set(['fire', 'fires', 'wildfire', 'wildfires'])
const MAX_SOURCE_LABEL_LENGTH = 160
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i

function validIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  // Date.parse also accepts implementation-dependent strings such as
  // "08/05/2026 10:00". Hazard metadata must carry an explicit date, time and
  // timezone so the UI never guesses whether a feed is fresh.
  if (!ISO_TIMESTAMP_PATTERN.test(normalized)) return null

  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

type PublicationMetadata = {
  timestamp: string | null
  invalid: boolean
}

function publicationMetadataOf(data: FireFeedData | null | undefined): PublicationMetadata {
  if (!data) return { timestamp: null, invalid: false }

  // The current field is authoritative when present. Falling back after it is
  // present but malformed would hide a broken producer timestamp behind stale
  // compatibility metadata.
  if (Object.prototype.hasOwnProperty.call(data, 'generated_at_utc')) {
    const timestamp = validIsoDate(data.generated_at_utc)
    return { timestamp, invalid: timestamp === null }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'generatedUtc')) {
    const timestamp = validIsoDate(data.generatedUtc)
    return { timestamp, invalid: timestamp === null }
  }

  return { timestamp: null, invalid: false }
}

function categoriesOf(feature: FireFeedFeature): string[] {
  return normalizeHazardCategories(feature.properties?.categories)
}

function hasUsablePointCoordinates(feature: FireFeedFeature): boolean {
  const geometry = feature.geometry
  if (!geometry || !Object.prototype.hasOwnProperty.call(geometry, 'coordinates')) return true

  const coordinates = geometry.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false

  // A GeoJSON position may include altitude or further ordinates, but every
  // supplied ordinate must remain a finite number. Counting a point with a
  // corrupt height value would publish a location that cannot be rendered or
  // inspected reliably even when longitude and latitude look valid.
  if (!coordinates.every(value => typeof value === 'number' && Number.isFinite(value))) return false

  const [longitude, latitude] = coordinates
  return longitude >= -180
    && longitude <= 180
    && latitude >= -90
    && latitude <= 90
}

function isFirePoint(feature: FireFeedFeature): boolean {
  return feature.geometry?.type === 'Point'
    && hasUsablePointCoordinates(feature)
    && categoriesOf(feature).some(category => FIRE_CATEGORIES.has(category.trim().toLowerCase()))
}

function normalizeSourceLabel(value: string): string {
  const normalized = value
    // Source labels are display metadata. Strip control and bidirectional
    // formatting characters so malformed feeds cannot hide or reorder text in
    // the status panel, while preserving normal Unicode names.
    .replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

  // Keep untrusted metadata from expanding the status panel indefinitely.
  // Truncate by Unicode code points so surrogate pairs are not split.
  return [...normalized].slice(0, MAX_SOURCE_LABEL_LENGTH).join('').trimEnd()
}

function sourceLabelsOf(features: FireFeedFeature[]): string[] {
  const labels = new Map<string, string>()

  for (const feature of features) {
    const source = feature.properties?.source
    if (typeof source !== 'string') continue

    const normalized = normalizeSourceLabel(source)
    if (!normalized) continue

    const key = normalized.toLocaleLowerCase('en-US')
    const existing = labels.get(key)

    // Choose a deterministic representative for case-only duplicates instead
    // of keeping whichever spelling happened to appear first in the feed.
    if (!existing || normalized < existing) labels.set(key, normalized)
  }

  return [...labels.values()].sort((left, right) => left.localeCompare(right, 'en-US', { sensitivity: 'base' }))
}

type ObservationTimestampMetadata = {
  timestamp: string | null
  present: boolean
}

function observationTimestampMetadataOf(feature: FireFeedFeature): ObservationTimestampMetadata {
  const properties = feature.properties
  if (!properties) return { timestamp: null, present: false }

  // observation_time is the current producer field. When it exists but is
  // malformed, do not conceal that problem behind the compatibility field.
  if (Object.prototype.hasOwnProperty.call(properties, 'observation_time')) {
    return {
      timestamp: validIsoDate(properties.observation_time),
      present: true,
    }
  }

  if (Object.prototype.hasOwnProperty.call(properties, 'observationUtc')) {
    return {
      timestamp: validIsoDate(properties.observationUtc),
      present: true,
    }
  }

  return { timestamp: null, present: false }
}

function ageHours(timestamp: string | null, nowMs: number): number | null {
  if (!timestamp) return null
  const age = (nowMs - Date.parse(timestamp)) / 3_600_000
  return Number.isFinite(age) && age >= 0 ? age : null
}

export function summarizeFireFeed(data: FireFeedData | null | undefined, now = new Date()): FireFeedSummary {
  const features = Array.isArray(data?.features)
    ? data.features.filter((feature): feature is FireFeedFeature => typeof feature === 'object' && feature !== null)
    : []

  const firePoints = features.filter(isFirePoint)
  const nowMs = now.getTime()
  const publication = publicationMetadataOf(data)
  const publishedAt = publication.timestamp
  const publishedInFuture = publishedAt !== null && Date.parse(publishedAt) > nowMs
  const latestAllowedObservationMs = publishedAt
    ? Math.min(nowMs, Date.parse(publishedAt))
    : nowMs

  const observationMetadata = firePoints.map(observationTimestampMetadataOf)
  const observationTimes = observationMetadata
    .map(metadata => metadata.timestamp)
    .filter((value): value is string => value !== null && Date.parse(value) <= latestAllowedObservationMs)
    .sort((left, right) => Date.parse(right) - Date.parse(left))
  const ignoredObservationTimestampCount = observationMetadata.filter(metadata =>
    metadata.present
      && (metadata.timestamp === null || Date.parse(metadata.timestamp) > latestAllowedObservationMs),
  ).length
  const latestObservationAt = observationTimes[0] ?? null
  const sourceLabels = sourceLabelsOf(firePoints)

  return {
    pointCount: firePoints.length,
    ...(sourceLabels.length ? { sourceLabels } : {}),
    publishedAt,
    latestObservationAt,
    publishedAgeHours: ageHours(publishedAt, nowMs),
    latestObservationAgeHours: ageHours(latestObservationAt, nowMs),
    publishedInFuture,
    publicationTimestampInvalid: publication.invalid,
    ignoredObservationTimestampCount,
  }
}
