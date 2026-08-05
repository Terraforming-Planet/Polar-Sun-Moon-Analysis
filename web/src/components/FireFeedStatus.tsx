import type { FireFeedSummary } from '../lib/summarizeFireFeed'

function formatUtc(value: string | null): string {
  if (!value) return 'brak danych'
  return new Date(value).toLocaleString('pl-PL', { timeZone: 'UTC' }) + ' UTC'
}

function formatAge(value: number | null): string {
  if (value === null) return 'brak danych'
  if (value < 1) return `${Math.round(value * 60)} min`
  return `${value.toFixed(1)} h`
}

function freshnessLabel(summary: FireFeedSummary): string {
  if (summary.publicationTimestampInvalid) return 'niespójne — nieprawidłowy czas publikacji'
  if (summary.publishedInFuture) return 'niespójne — czas publikacji jest w przyszłości'

  const ages = [summary.publishedAgeHours, summary.latestObservationAgeHours]
    .filter((value): value is number => value !== null)

  if (!ages.length) return 'nieznana — brak metadanych czasu'
  if (Math.max(...ages) > 24) return 'opóźnione — ponad 24 h'
  return 'aktualne według ostatniego pliku — do 24 h'
}

function sourceDisplay(summary: FireFeedSummary, fallback: string): string {
  const detected = summary.sourceLabels
    ?.map(label => label.trim())
    .filter(Boolean)

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

  return <section className="panel" aria-label="Status ostatniego opublikowanego pliku pożarowego" aria-live="polite">
    <h2>Status danych pożarowych</h2>
    <div className="fact"><span>Źródło katalogu</span><b>{normalizedSource}</b></div>
    <div className="fact"><span>Punkty pożarowe</span><b>{summary.pointCount}</b></div>
    <div className="fact"><span>Publikacja pliku</span><b>{formatUtc(summary.publishedAt)}</b></div>
    <div className="fact"><span>Wiek pliku</span><b>{formatAge(summary.publishedAgeHours)}</b></div>
    <div className="fact"><span>Najnowsza obserwacja</span><b>{formatUtc(summary.latestObservationAt)}</b></div>
    <div className="fact"><span>Wiek obserwacji</span><b>{formatAge(summary.latestObservationAgeHours)}</b></div>
    <div className="fact"><span>Stan świeżości</span><b>{freshnessLabel(summary)}</b></div>
    {ignoredTimestampCount > 0 && <p className="muted" role="note">
      Pominięte znaczniki czasu obserwacji: {ignoredTimestampCount}. Punkty pozostają w liczniku, ale błędne lub niemożliwe czasy nie wyznaczają najnowszej obserwacji.
    </p>}
    <p className="muted">Ostatni opublikowany plik; nie jest to ciągły obraz czasu rzeczywistego.</p>
  </section>
}