import { FireFeedStatus } from './FireFeedStatus'
import { summarizeFireFeed, type FireFeedData } from '../lib/summarizeFireFeed'

type FireFeedPanelProps = {
  data: FireFeedData | null | undefined
  sourceLabel: string
  now?: Date
  error?: unknown
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

export function FireFeedPanel({ data, sourceLabel, now = new Date(), error }: FireFeedPanelProps) {
  const refreshError = getRefreshErrorMessage(error)

  return <section aria-label="Status ostatniego opublikowanego pliku pożarowego">
    {refreshError && <p className="notice" role="status">
      Nie udało się odświeżyć katalogu pożarów: {refreshError}. Poniższy status dotyczy ostatnich danych, które udało się wczytać.
    </p>}
    <FireFeedStatus
      sourceLabel={sourceLabel}
      summary={summarizeFireFeed(data, now)}
    />
  </section>
}
