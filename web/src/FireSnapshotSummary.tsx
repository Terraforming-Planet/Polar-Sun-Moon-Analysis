import { formatFireSnapshotStatus, summarizeFireCatalog, type HazardCatalogLike } from './lib/hazardFreshness'

type Props = {
  catalog: HazardCatalogLike | null | undefined
  nowMs?: number
}

function formatUtc(value: string | null) {
  if (!value) return 'brak czasu w pliku'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'nieprawidłowy czas w pliku'
  return `${new Date(timestamp).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC`
}

export function FireSnapshotSummary({ catalog, nowMs = Date.now() }: Props) {
  const summary = summarizeFireCatalog(catalog, nowMs)
  const status = formatFireSnapshotStatus(summary)

  return <aside className="panel fire-snapshot-summary" aria-label="Stan ostatniego katalogu pożarów">
    <h2>{status.headline}</h2>
    <div className="fact"><span>Opublikowano</span><b>{formatUtc(summary.generatedAtUtc)}</b></div>
    <div className="fact"><span>Świeżość</span><b>{status.freshness}</b></div>
    <p className="muted">{status.detail}</p>
    <p className="muted">Punkty są filtrowane do kategorii fire/wildfire i poprawnych współrzędnych. Brak punktów oznacza brak punktów w opublikowanym pliku, a nie potwierdzenie braku pożarów na świecie.</p>
  </aside>
}
