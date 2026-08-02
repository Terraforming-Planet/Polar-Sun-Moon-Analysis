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

export function isFireFeature(feature: HazardFeature): boolean {
  return (feature.properties?.categories ?? []).some(category => {
    const normalized = category.toLowerCase()
    return normalized.includes('fire') || normalized.includes('wildfire')
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

  return {
    pointCount: firePoints.length,
    generatedAtUtc: generatedAtUtc ?? null,
    ageHours: generatedAge.ageHours,
    generatedAtIsFuture: generatedAge.isFuture,
    latestObservationUtc,
    observationAgeHours: observationAge.ageHours,
    observationIsFuture: observationAge.isFuture,
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
    <div className="fact"><span>Aktywne punkty w pliku</span><b>{summary.pointCount}</b></div>
    <div className="fact"><span>Najnowsza obserwacja punktu</span><b>{formatUtc(summary.latestObservationUtc)}</b></div>
    <div className="fact"><span>Wiek najnowszej obserwacji</span><b>{formatAge(summary.observationAgeHours, summary.observationIsFuture)}</b></div>
    <div className="fact"><span>Czas publikacji katalogu</span><b>{formatUtc(summary.generatedAtUtc)}</b></div>
    <div className="fact"><span>Wiek pliku</span><b>{formatAge(summary.ageHours, summary.generatedAtIsFuture)}</b></div>
    <p className="muted">Licznik obejmuje wyłącznie geometrie punktowe zaklasyfikowane jako pożar w ostatnim opublikowanym pliku źródłowym. Nie jest to ciągły obraz czasu rzeczywistego; liczba zmienia się dopiero po publikacji nowego katalogu.</p>
  </aside>
}
