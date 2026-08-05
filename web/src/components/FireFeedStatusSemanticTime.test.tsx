import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

describe('FireFeedStatus semantic timestamps', () => {
  it('keeps exact UTC instants in datetime attributes while showing localized text', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA FIRMS / VIIRS" summary={{
      pointCount: 1,
      publishedAt: '2026-08-05T02:07:55.123Z',
      latestObservationAt: '2026-08-05T01:59:01.456Z',
      publishedAgeHours: 1,
      latestObservationAgeHours: 1.15,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('<time dateTime="2026-08-05T02:07:55.123Z">')
    expect(markup).toContain('<time dateTime="2026-08-05T01:59:01.456Z">')
    expect(markup.match(/<time/g)).toHaveLength(2)
  })

  it('does not invent a datetime value when timestamp metadata is unavailable', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 0,
      publishedAt: null,
      latestObservationAt: null,
      publishedAgeHours: null,
      latestObservationAgeHours: null,
      publishedInFuture: false,
    }}/>)

    expect(markup).not.toContain('dateTime=')
    expect(markup.match(/<time>brak danych<\/time>/g)).toHaveLength(2)
  })
})