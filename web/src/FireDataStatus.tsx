import React from 'react'

type HazardFeature = {
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
}

export function isFireFeature(feature: HazardFeature): boolean {
  return (feature.properties?.categories ?? []).some(category => {
    const normalized = category.toLowerCase()
    return normalized.includes('fire') || normalized.includes('wildfire')
  })
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

export function fireFeedSummary(
  features: HazardFeature[] = [],
  generatedAtUtc?: string,
  nowMs = Date.now(),
) {
  const fireFeatures = features.filter(isFireFeature)
  const generatedMs = generatedAtUtc ? Date.parse(generatedAtUtc) : Number.NaN
  const latestObservationUtc = newestValidTimestamp(
    fireFeatures.map(feature => feature.properties?.observation_time),
  )
  const latestObservationMs = latestObservationUtc ? Date.parse(latestObservationUtc) : Number.NaN
  const ageHours = Number.isFinite(generatedMs)
    ? Math.max(0, (nowMs - generatedMs) / 3_600_000)
    : null
  const observationAgeHours = Number.isFinite(latestObservationMs)
    ? Math.max(0, (nowMs - latestObservationMs) / 3_600_000)
    : null

  return {
    pointCount: fireFeatures.length,
    generatedAtUtc: generatedAtUtc ?? null,
    ageHours,
    latestObservationUtc,
    observationAgeHours,
  }
}

function formatUtc(value: string | null): string {
  if (!value) return 'brak czasu publikacji'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'nieprawidłowy czas publikacji'
  return `${date.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC`
}

function formatAge(value: number | null): string {
  return value === null ? 'nieznany' : `${value.toFixed(1)} h`
}

export function FireDataStatus({
  features = [],
  generatedAtUtc,
  generatedUtc,
  nowMs = Date.now(),
}: FireDataStatusProps) {
  const resolvedGeneratedAt = resolveHazardGeneratedAt(generatedAtUtc, generatedUtc)
  const summary = fireFeedSummary(features, resolvedGeneratedAt, nowMs)

  return <aside className="panel fire-data-status" aria-label="Stan danych pożarowych">
    <h2>Stan opublikowanego pliku pożarów</h2>
    <div className="fact"><span>Aktywne punkty w pliku</span><b>{summary.pointCount}</b></div>
    <div className="fact"><span>Najnowsza obserwacja punktu</span><b>{formatUtc(summary.latestObservationUtc)}</b></div>
    <div className="fact"><span>Wiek najnowszej obserwacji</span><b>{formatAge(summary.observationAgeHours)}</b></div>
    <div className="fact"><span>Czas publikacji katalogu</span><b>{formatUtc(summary.generatedAtUtc)}</b></div>
    <div className="fact"><span>Wiek pliku</span><b>{formatAge(summary.ageHours)}</b></div>
    <p className="muted">To stan ostatniego opublikowanego pliku źródłowego, a nie ciągły obraz czasu rzeczywistego. Liczba zmienia się dopiero po publikacji nowego katalogu.</p>
  </aside>
}
