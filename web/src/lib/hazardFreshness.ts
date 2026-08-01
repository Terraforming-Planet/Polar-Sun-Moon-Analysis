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

export type FireSnapshotStatus = {
  headline: string
  detail: string
  freshness: string
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

export function selectFirePoints(
  catalog: HazardCatalogLike | null | undefined,
): HazardFeatureLike[] {
  const features = Array.isArray(catalog?.features) ? catalog.features : []
  return features.filter(isFirePoint)
}

export function summarizeFireCatalog(
  catalog: HazardCatalogLike | null | undefined,
  nowMs = Date.now(),
): FireCatalogSummary {
  const pointCount = selectFirePoints(catalog).length
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

export function formatFireSnapshotStatus(summary: FireCatalogSummary): FireSnapshotStatus {
  if (summary.status === 'missing-timestamp') {
    return {
      headline: `${summary.pointCount} aktywnych punktów pożarowych`,
      detail: 'Brak czasu wygenerowania pliku — świeżość danych jest nieznana.',
      freshness: 'wiek danych: nieznany',
    }
  }

  const ageHours = summary.ageHours ?? 0
  const freshness = ageHours < 1
    ? `wiek danych: ${Math.round(ageHours * 60)} min`
    : `wiek danych: ${ageHours.toFixed(1)} h`

  if (summary.status === 'empty') {
    return {
      headline: '0 aktywnych punktów pożarowych',
      detail: 'Ostatni opublikowany snapshot nie zawiera punktów pożarowych.',
      freshness,
    }
  }

  return {
    headline: `${summary.pointCount} aktywnych punktów pożarowych`,
    detail: 'Ostatni opublikowany snapshot — nie ciągły przekaz na żywo.',
    freshness,
  }
}
