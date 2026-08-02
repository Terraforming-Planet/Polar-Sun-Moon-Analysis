import React from 'react'

type HazardFeature = {
  geometry?: {
    type?: string
  }
  properties?: {
    categories?: unknown[]
    observation_time?: unknown
  }
}

type FireDataStatusProps = {
  features?: HazardFeature[]
  generatedAtUtc?: string
  generatedUtc?: string
  nowMs?: number
  sourceLabel?: string
}

type FireFeedFreshness = 'current' | 'stale' | 'missing' | 'invalid-future'
type FirePointAvailability = 'available' | 'empty-published-file' | 'unavailable'
type FireMetadataConsistency = 'consistent' | 'observation-after-publication' | 'unknown'

const FIRE_CATEGORY_NAMES = new Set(['fire', 'wildfire', 'wildfires'])
const STALE_AFTER_HOURS = 24
const DEFAULT_FIRE_SOURCE_LABEL = 'NASA EONET'

export function isFireFeature(feature: HazardFeature): boolean {
  return (feature.properties?.categories ?? []).some(category => {
    if (typeof category !== 'string') return false
    const normalized = category.trim().toLowerCase()
    return FIRE_CATEGORY_NAMES.has(normalized)
  })
}

export function isPublishedFirePoint(feature: HazardFeature): boolean {
  return feature.geometry?.type === 'Point' && isFireFeature(feature)
}

export function resolveHazardGeneratedAt(
  generatedAtUtc?: string,
  generatedUtc?: string,
): string | undefined {
  return generatedAtUtc || generatedUtc
}

export function resolveFireSourceLabel(sourceLabel?: string): string {
  const normalized = sourceLabel?.trim()
  return normalized || DEFAULT_FIRE_SOURCE_LABEL
}

function newestValidTimestamp(values: unknown[]): string | null {
  const valid = values
    .filter((value): value is string => typeof value === 'string')
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time)
  return valid[0]?.value ?? null
}

function timestampAge(timeMs: number, nowMs: number) {
  if (!Number.isFinite(timeMs)) return { ageHours: null, isFuture: false }
  const deltaHours = (nowMs - timeMs) / 3_600_000
  return {
    ageHours: Math.max(0, deltaHours),
    isFuture: deltaHours < 0,
  }
}

export function resolveFireFeedFreshness(
  ageHours: number | null,
  isFuture: boolean,
): FireFeedFreshness {
  if (isFuture) return 'invalid-future'
  if (ageHours === null) return 'missing'
  return ageHours > STALE_AFTER_HOURS ? 'stale' : 'current'
}

export function resolveFirePointAvailability(
  pointCount: number,
  freshness: FireFeedFreshness,
): FirePointAvailability {
  if (pointCount > 0) return 'available'
  if (freshness === 'current' || freshness === 'stale') return 'empty-published-file'
  return 'unavailable'
}

export function resolveFireMetadataConsistency(
  generatedMs: number,
  latestObservationMs: number,
): FireMetadataConsistency {
  if (!Number.isFinite(generatedMs) || !Number.isFinite(latestObservationMs)) return 'unknown'
  return latestObservationMs > generatedMs ? 'observation-after-publication' : 'consistent'
}

export function fireFeedSummary(
  features: HazardFeature[] = [],
  generatedAtUtc?: string,
  nowMs = Date.now(),
) {
  const firePoints = features.filter(isPublishedFirePoint)
  const generatedMs = generatedAtUtc ? Date.parse(generatedAtUtc) : Number.NaN
  const latestObservationUtc = newestValidTimestamp(
    firePoints.map(feature => feature.properties?.observation_time),
  )
  const latestObservationMs = latestObservationUtc ? Date.parse(latestObservationUtc) : Number.NaN
  const generatedAge = timestampAge(generatedMs, nowMs)
  const observationAge = timestampAge(latestObservationMs, nowMs)
  const freshness = resolveFireFeedFreshness(generatedAge.ageHours, generatedAge.isFuture)
  const observationFreshness = resolveFireFeedFreshness(
    observationAge.ageHours,
    observationAge.isFuture,
  )

  return {
    pointCount: firePoints.length,
    pointAvailability: resolveFirePointAvailability(firePoints.length, freshness),
    generatedAtUtc: generatedAtUtc ?? null,
    ageHours: generatedAge.ageHours,
    generatedAtIsFuture: generatedAge.isFuture,
    freshness,
    latestObservationUtc,
    observationAgeHours: observationAge.ageHours,
    observationIsFuture: observationAge.isFuture,
    observationFreshness,
    metadataConsistency: resolveFireMetadataConsistency(generatedMs, latestObservationMs),
  }
}

function formatUtc(value: string | null): string {
  if (!value) return 'brak czasu publikacji'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'nieprawidłowy czas publikacji'
  return `${date.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC`
}

function formatAge(value: number | null, isFuture = false): string {
  if (isFuture) return 'czas przyszły — sprawdź zegar lub metadane'
  return value === null ? 'nieznany' : `${value.toFixed(1)} h`
}

function freshnessLabel(value: FireFeedFreshness, subject: 'file' | 'observation' = 'file'): string {
  if (value === 'current') {
    return subject === 'observation'
      ? 'najnowsza obserwacja ma ≤ 24 h'
      : 'aktualny opublikowany plik (≤ 24 h)'
  }
  if (value === 'stale') {
    return subject === 'observation'
      ? 'najnowsza obserwacja ma ponad 24 h'
      : 'plik starszy niż 24 h'
  }
  if (value === 'invalid-future') return 'błędny czas w przyszłości'
  return subject === 'observation'
    ? 'brak poprawnego czasu obserwacji'
    : 'brak poprawnego czasu publikacji'
}

function pointAvailabilityLabel(value: FirePointAvailability): string {
  if (value === 'available') return 'punkty pożarowe dostępne'
  if (value === 'empty-published-file') return 'opublikowany plik nie zawiera punktów pożarowych'
  return 'nie można potwierdzić stanu punktów bez poprawnych metadanych pliku'
}

function metadataConsistencyLabel(value: FireMetadataConsistency): string {
  if (value === 'consistent') return 'czas obserwacji nie przekracza czasu publikacji'
  if (value === 'observation-after-publication') return 'niespójne metadane — obserwacja jest późniejsza niż publikacja katalogu'
  return 'nie można porównać czasów publikacji i obserwacji'
}

export function FireDataStatus({
  features = [],
  generatedAtUtc,
  generatedUtc,
  nowMs = Date.now(),
  sourceLabel,
}: FireDataStatusProps) {
  const resolvedGeneratedAt = resolveHazardGeneratedAt(generatedAtUtc, generatedUtc)
  const resolvedSourceLabel = resolveFireSourceLabel(sourceLabel)
  const summary = fireFeedSummary(features, resolvedGeneratedAt, nowMs)

  return <aside className="panel fire-data-status" aria-label="Stan danych pożarowych" aria-live="polite" aria-atomic="true">
    <h2>Stan opublikowanego pliku pożarów</h2>
    <div className="fact"><span>Źródło katalogu</span><b>{resolvedSourceLabel}</b></div>
    <div className="fact"><span>Stan świeżości pliku</span><b>{freshnessLabel(summary.freshness)}</b></div>
    <div className="fact"><span>Dostępność punktów</span><b>{pointAvailabilityLabel(summary.pointAvailability)}</b></div>
    <div className="fact"><span>Aktywne punkty w pliku</span><b>{summary.pointCount}</b></div>
    <div className="fact"><span>Stan świeżości obserwacji</span><b>{freshnessLabel(summary.observationFreshness, 'observation')}</b></div>
    <div className="fact"><span>Najnowsza obserwacja punktu</span><b>{formatUtc(summary.latestObservationUtc)}</b></div>
    <div className="fact"><span>Wiek najnowszej obserwacji</span><b>{formatAge(summary.observationAgeHours, summary.observationIsFuture)}</b></div>
    <div className="fact"><span>Czas publikacji katalogu</span><b>{formatUtc(summary.generatedAtUtc)}</b></div>
    <div className="fact"><span>Wiek pliku</span><b>{formatAge(summary.ageHours, summary.generatedAtIsFuture)}</b></div>
    <div className="fact"><span>Spójność czasów</span><b>{metadataConsistencyLabel(summary.metadataConsistency)}</b></div>
    <p className="muted">Licznik obejmuje wyłącznie geometrie punktowe zaklasyfikowane jako pożar w ostatnim opublikowanym pliku źródłowym. Zero oznacza brak takich punktów w tym konkretnym pliku tylko wtedy, gdy plik ma poprawny czas publikacji. Nie jest to ciągły obraz czasu rzeczywistego; liczba zmienia się dopiero po publikacji nowego katalogu.</p>
  </aside>
}
