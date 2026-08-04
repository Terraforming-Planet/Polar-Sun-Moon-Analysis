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
}

const FIRE_CATEGORY_PATTERN = /(?:^|\b)(?:wild)?fire(?:s)?(?:\b|$)/i

function validIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function categoriesOf(feature: FireFeedFeature): string[] {
  const categories = feature.properties?.categories
  return Array.isArray(categories)
    ? categories.filter((value): value is string => typeof value === 'string')
    : []
}

function isFirePoint(feature: FireFeedFeature): boolean {
  return feature.geometry?.type === 'Point'
    && categoriesOf(feature).some(category => FIRE_CATEGORY_PATTERN.test(category))
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
  const publishedAt = validIsoDate(data?.generated_at_utc) ?? validIsoDate(data?.generatedUtc)
  const observationTimes = firePoints
    .map(feature => validIsoDate(feature.properties?.observation_time))
    .filter((value): value is string => value !== null && Date.parse(value) <= nowMs)
    .sort((left, right) => Date.parse(right) - Date.parse(left))
  const latestObservationAt = observationTimes[0] ?? null

  return {
    pointCount: firePoints.length,
    publishedAt,
    latestObservationAt,
    publishedAgeHours: ageHours(publishedAt, nowMs),
    latestObservationAgeHours: ageHours(latestObservationAt, nowMs),
  }
}
