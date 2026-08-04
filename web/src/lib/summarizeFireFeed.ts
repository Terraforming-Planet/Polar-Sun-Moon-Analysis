export type FireFeedFeature = {
  geometry?: { type?: string } | null
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
  sourceLabels: string[]
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

function sourceLabelsOf(features: FireFeedFeature[]): string[] {
  const labels = new Map<string, string>()

  for (const feature of features) {
    const source = feature.properties?.source
    if (typeof source !== 'string') continue

    const normalized = source.trim()
    if (!normalized) continue

    const key = normalized.toLocaleLowerCase('en-US')
    if (!labels.has(key)) labels.set(key, normalized)
  }

  return [...labels.values()]
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

  return {
    pointCount: firePoints.length,
    sourceLabels: sourceLabelsOf(firePoints),
    publishedAt,
    latestObservationAt,
    publishedAgeHours: ageHours(publishedAt, nowMs),
    latestObservationAgeHours: ageHours(latestObservationAt, nowMs),
    publishedInFuture,
    publicationTimestampInvalid: publication.invalid,
    ignoredObservationTimestampCount,
  }
}
