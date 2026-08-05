import type { FireFeedSummary } from '../lib/summarizeFireFeed'

function validTimestamp(value: string | null): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? value : null
}

function formatUtc(value: string | null): string {
  const normalized = validTimestamp(value)
  if (!normalized) return 'brak danych'
  return new Date(normalized).toLocaleString('pl-PL', { timeZone: 'UTC' }) + ' UTC'
}

function isValidAge(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0
}

function formatAge(value: number | null): string {
  if (!isValidAge(value)) return 'brak danych'
  if (value === 0) return '0 min'
  if (value < 1 / 60) return '< 1 min'
  if (value < 1) return `${Math.round(value * 60)} min`
  return `${value.toFixed(1)} h`
}

function freshnessLabel(summary: FireFeedSummary): string {
  if (summary.publicationTimestampInvalid) return 'niespójne — nieprawidłowy czas publikacji'
  if (summary.publishedInFuture) return 'niespójne — czas publikacji jest w przyszłości'
  if (summary.pointCount === 0 && isValidAge(summary.publishedAgeHours)) {
    return 'brak punktów pożarowych w ostatnim pliku'
  }
  if (summary.pointCount > 0 && !isValidAge(summary.publishedAgeHours)) {
    return 'częściowe — brak wiarygodnego czasu publikacji'
  }
  if (summary.pointCount > 0 && !isValidAge(summary.latestObservationAgeHours)) {
    return 'częściowe — brak wiarygodnego czasu obserwacji'
  }

  const ages = [summary.publishedAgeHours, summary.latestObservationAgeHours]
    .filter(isValidAge)

  if (!ages.length) return 'nieznana — brak metadanych czasu'
  if (Math.max(...ages) > 24) return 'opóźnione — ponad 24 h'
  return 'aktualne według ostatniego pliku — do 24 h'
}

function sourceDisplay(summary: FireFeedSummary, fallback: string): string {
  const seen = new Set<string>()
  const detected = summary.sourceLabels
    ?.map(label => label.trim())
    .filter(label => {
      if (!label) return false
      const key = label.toLocaleLowerCase('en-US')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  if (detected?.length) return detected.join(', ')
  return fallback.trim() || 'brak danych'
}

type FireFeedStatusProps = {
  summary: FireFeedSummary
  sourceLabel: string
}

export function FireFeedStatus({ summary, sourceLabel }: FireFeedStatusProps) {
  const normalizedSource = sourceDisplay(summary, sourceLabel)
  const ignoredTimestampCount = summary.ignoredObservationTimestampCount ?? 0
  const publishedAt = validTimestamp(summary.publishedAt)
  const latestObservationAt = validTimestamp(summary.latestObservationAt)

  return <section className="panel" aria-label="Status ostatniego opublikowanego pliku pożarowego" aria-live="polite">
    <h2>Status danych pożarowych</h2>
    <div className="fact"><span>Źródło katalogu</span><b>{normalizedSource}</b></div>
    <div className="fact"><span>Punkty pożarowe</span><b>{summary.pointCount}</b></div>
    <div className="fact"><span>Publikacja pliku</span><b><time dateTime={publishedAt ?? undefined}>{formatUtc(publishedAt)}</time></b></div>
    <div className="fact"><span>Wiek pliku</span><b>{formatAge(summary.publishedAgeHours)}</b></div>
    <div className="fact"><span>Najnowsza obserwacja</span><b><time dateTime={latestObservationAt ?? undefined}>{formatUtc(latestObservationAt)}</time></b></div>
    <div className="fact"><span>Wiek obserwacji</span><b>{formatAge(summary.latestObservationAgeHours)}</b></div>
    <div className="fact"><span>Stan świeżości</span><b>{freshnessLabel(summary)}</b></div>
    {ignoredTimestampCount > 0 && <p className="muted" role="note">
      Pominięte znaczniki czasu obserwacji: {ignoredTimestampCount}. Punkty pozostają w liczniku, ale błędne lub niemożliwe czasy nie wyznaczają najnowszej obserwacji.
    </p>}
    <p className="muted">Ostatni opublikowany plik; nie jest to ciągły obraz czasu rzeczywistego.</p>
  </section>
}