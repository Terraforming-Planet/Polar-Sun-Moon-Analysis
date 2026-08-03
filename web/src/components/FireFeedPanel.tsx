import { FireFeedStatus } from './FireFeedStatus'
import { summarizeFireFeed, type FireFeedData } from '../lib/summarizeFireFeed'

type FireFeedPanelProps = {
  data: FireFeedData | null | undefined
  sourceLabel: string
  now?: Date
  error?: string | null
}

export function FireFeedPanel({ data, sourceLabel, now = new Date(), error }: FireFeedPanelProps) {
  return <section aria-label="Status ostatniego opublikowanego pliku pożarowego">
    {error && <p className="notice" role="status">
      Nie udało się odświeżyć katalogu pożarów: {error}. Poniższy status dotyczy ostatnich danych, które udało się wczytać.
    </p>}
    <FireFeedStatus
      sourceLabel={sourceLabel}
      summary={summarizeFireFeed(data, now)}
    />
  </section>
}
