export type HazardFeatureLike = {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: {
    categories?: string[]
    observation_time?: string
  }
}

export type HazardCatalogLike = {
  generated_at_utc?: string
  generatedUtc?: string
  features?: HazardFeatureLike[]
}

export type FireCatalogSummary = {
  pointCount: number
  generatedAtUtc: string | null
  ageHours: number | null
  status: 'available' | 'empty' | 'missing-timestamp'
}

const FIRE_CATEGORY_NAMES = new Set(['wildfires', 'wildfire', 'fires', 'fire'])

function isFiniteCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
}

export function isFirePoint(feature: HazardFeatureLike): boolean {
  const categories = feature.properties?.categories ?? []
  const fireCategory = categories.some(category => FIRE_CATEGORY_NAMES.has(category.trim().toLowerCase()))
  return fireCategory
    && feature.geometry?.type === 'Point'
    && isFiniteCoordinatePair(feature.geometry.coordinates)
}

export function summarizeFireCatalog(
  catalog: HazardCatalogLike | null | undefined,
  nowMs = Date.now(),
): FireCatalogSummary {
  const features = Array.isArray(catalog?.features) ? catalog.features : []
  const pointCount = features.filter(isFirePoint).length
  const generatedAtUtc = catalog?.generated_at_utc ?? catalog?.generatedUtc ?? null
  const generatedMs = generatedAtUtc ? Date.parse(generatedAtUtc) : Number.NaN
  const ageHours = Number.isFinite(generatedMs)
    ? Math.max(0, (nowMs - generatedMs) / 3_600_000)
    : null

  return {
    pointCount,
    generatedAtUtc,
    ageHours,
    status: generatedAtUtc ? (pointCount > 0 ? 'available' : 'empty') : 'missing-timestamp',
  }
}
