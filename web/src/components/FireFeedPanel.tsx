import { FireFeedStatus } from './FireFeedStatus'
import { summarizeFireFeed, type FireFeedData } from '../lib/summarizeFireFeed'

type FireFeedPanelProps = {
  data: FireFeedData | null | undefined
  sourceLabel: string
  now?: Date
  error?: unknown
  isRefreshing?: boolean
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError'
  }

  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false
  }

  return typeof error.name === 'string' && error.name === 'AbortError'
}

function getObjectErrorMessage(error: object): string | null {
  if (!('message' in error) || typeof error.message !== 'string') {
    return null
  }

  return error.message.trim() || null
}

function getRefreshErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') {
    return error.trim() || null
  }

  // Errors crossing an iframe/worker boundary may not pass instanceof Error.
  // Their AbortError name is still enough to identify an intentional cancellation.
  if (isAbortError(error)) {
    return null
  }

  if (error instanceof Error) {
    return error.message.trim() || error.name.trim() || null
  }

  if (typeof error === 'object' && error !== null) {
    return getObjectErrorMessage(error)
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
  const isActivelyRefreshing = isRefreshing && !refreshError

  return <section
    aria-label="Status ostatniego opublikowanego pliku pożarowego"
    aria-busy={isActivelyRefreshing}
  >
    {isActivelyRefreshing && <p className="notice" role="status" aria-live="polite">
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
