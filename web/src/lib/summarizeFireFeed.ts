export type FireFeedFeature = {
  geometry?: { type?: string } | null
  properties?: {
    categories?: unknown
    observation_time?: unknown
  } | null
}

export type FireFeedData = {
  generated_at_utc?: unknown
  generatedUtc?: unknown
  features?: unknown
}

export type FireFeedSummary = {
  pointCount: number
  publishedAt: string | null
  latestObservationAt: string | null
  publishedAgeHours: number | null
  latestObservationAgeHours: number | null
  publishedInFuture: boolean
  publicationTimestampInvalid?: boolean
  ignoredObservationTimestampCount?: number
}

const FIRE_CATEGORIES = new Set(['fire', 'fires', 'wildfire', 'wildfires'])

function validIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
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
  const categories = feature.properties?.categories
  return Array.isArray(categories)
    ? categories.filter((value): value is string => typeof value === 'string')
    : []
}

function isFirePoint(feature: FireFeedFeature): boolean {
  return feature.geometry?.type === 'Point'
    && categoriesOf(feature).some(category => FIRE_CATEGORIES.has(category.trim().toLowerCase()))
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

  const parsedObservationTimes = firePoints.map(feature => validIsoDate(feature.properties?.observation_time))
  const observationTimes = parsedObservationTimes
    .filter((value): value is string => value !== null && Date.parse(value) <= latestAllowedObservationMs)
    .sort((left, right) => Date.parse(right) - Date.parse(left))
  const ignoredObservationTimestampCount = parsedObservationTimes.length - observationTimes.length
  const latestObservationAt = observationTimes[0] ?? null

  return {
    pointCount: firePoints.length,
    publishedAt,
    latestObservationAt,
    publishedAgeHours: ageHours(publishedAt, nowMs),
    latestObservationAgeHours: ageHours(latestObservationAt, nowMs),
    publishedInFuture,
    publicationTimestampInvalid: publication.invalid,
    ignoredObservationTimestampCount,
  }
}