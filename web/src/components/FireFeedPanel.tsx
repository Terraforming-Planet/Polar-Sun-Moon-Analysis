import { FireFeedStatus } from './FireFeedStatus'
import { summarizeFireFeed, type FireFeedData } from '../lib/summarizeFireFeed'

type FireFeedPanelProps = {
  data: FireFeedData | null | undefined
  sourceLabel: string
  now?: Date
  error?: unknown
  isRefreshing?: boolean
}

function getRefreshErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') {
    return error.trim() || null
  }

  if (error instanceof Error) {
    return error.message.trim() || error.name.trim() || null
  }

  return null
}

export function FireFeedPanel({
  data,
  sourceLabel,
  now = new Date(),
  error,
  isRefreshing = false,
}: FireFeedPanelProps) {
  const refreshError = getRefreshErrorMessage(error)
  const hasLoadedFile = data !== null && data !== undefined

  return <section aria-label="Status ostatniego opublikowanego pliku pożarowego">
    {isRefreshing && !refreshError && <p className="notice" role="status" aria-live="polite">
      {hasLoadedFile
        ? 'Sprawdzanie nowszego pliku pożarowego. Poniższy status dotyczy ostatnich danych, które udało się wczytać.'
        : 'Pobieranie ostatniego opublikowanego pliku pożarowego. Dane nie są jeszcze dostępne.'}
    </p>}
    {refreshError && <p className="notice" role="status" aria-live="polite">
      {hasLoadedFile
        ? `Nie udało się odświeżyć katalogu pożarów: ${refreshError}. Poniższy status dotyczy ostatnich danych, które udało się wczytać.`
        : `Nie udało się pobrać katalogu pożarów: ${refreshError}. Brak wcześniej wczytanego pliku.`}
    </p>}
    <FireFeedStatus
      sourceLabel={sourceLabel}
      summary={summarizeFireFeed(data, now)}
    />
  </section>
}
