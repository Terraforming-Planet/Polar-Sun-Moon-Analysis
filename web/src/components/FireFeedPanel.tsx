import { FireFeedStatus } from './FireFeedStatus'
import { summarizeFireFeed, type FireFeedData } from '../lib/summarizeFireFeed'

type FireFeedPanelProps = {
  data: FireFeedData | null | undefined
  sourceLabel: string
  now?: Date
}

export function FireFeedPanel({ data, sourceLabel, now = new Date() }: FireFeedPanelProps) {
  return <FireFeedStatus
    sourceLabel={sourceLabel}
    summary={summarizeFireFeed(data, now)}
  />
}
