import React from 'react'

type HazardFeature = {
  geometry?: {
    type?: string
  }
  properties?: {
    categories?: string[]
    observation_time?: string
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

const FIRE_CATEGORY_NAMES = new Set(['fire', 'wildfire', 'wildfires'])
const STALE_AFTER_HOURS = 24

export function isFireFeature(feature: HazardFeature): boolean {
  return (feature.properties?.categories ?? []).some(category => {
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

function newestValidTimestamp(values: Array<string | undefined>): string | null {
  const valid = values
    .map(value => ({ value, time: value ? Date.parse(value) : Number.NaN }))
    .filter((entry): entry is { value: string; time: number } => Boolean(entry.value) && Number.isFinite(entry.time))
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
    generatedAtUtc: generatedAtUtc ?? null,
    ageHours: generatedAge.ageHours,
    generatedAtIsFuture: generatedAge.isFuture,
    freshness,
    latestObservationUtc,
    observationAgeHours: observationAge.ageHours,
    observationIsFuture: observationAge.isFuture,
    observationFreshness,
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

export function FireDataStatus({
  features = [],
  generatedAtUtc,
  generatedUtc,
  nowMs = Date.now(),
  sourceLabel = 'NASA EONET',
}: FireDataStatusProps) {
  const resolvedGeneratedAt = resolveHazardGeneratedAt(generatedAtUtc, generatedUtc)
  const summary = fireFeedSummary(features, resolvedGeneratedAt, nowMs)

  return <aside className="panel fire-data-status" aria-label="Stan danych pożarowych">
    <h2>Stan opublikowanego pliku pożarów</h2>
    <div className="fact"><span>Źródło katalogu</span><b>{sourceLabel}</b></div>
    <div className="fact"><span>Stan świeżości pliku</span><b>{freshnessLabel(summary.freshness)}</b></div>
    <div className="fact"><span>Aktywne punkty w pliku</span><b>{summary.pointCount}</b></div>
    <div className="fact"><span>Stan świeżości obserwacji</span><b>{freshnessLabel(summary.observationFreshness, 'observation')}</b></div>
    <div className="fact"><span>Najnowsza obserwacja punktu</span><b>{formatUtc(summary.latestObservationUtc)}</b></div>
    <div className="fact"><span>Wiek najnowszej obserwacji</span><b>{formatAge(summary.observationAgeHours, summary.observationIsFuture)}</b></div>
    <div className="fact"><span>Czas publikacji katalogu</span><b>{formatUtc(summary.generatedAtUtc)}</b></div>
    <div className="fact"><span>Wiek pliku</span><b>{formatAge(summary.ageHours, summary.generatedAtIsFuture)}</b></div>
    <p className="muted">Licznik obejmuje wyłącznie geometrie punktowe zaklasyfikowane jako pożar w ostatnim opublikowanym pliku źródłowym. Nie jest to ciągły obraz czasu rzeczywistego; liczba zmienia się dopiero po publikacji nowego katalogu.</p>
  </aside>
}
