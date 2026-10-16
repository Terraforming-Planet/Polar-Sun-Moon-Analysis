import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

describe('FireFeedStatus missing publication age handling', () => {
  it('does not call observations current when publication age is unavailable', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA FIRMS / VIIRS" summary={{
      pointCount: 4,
      publishedAt: null,
      latestObservationAt: '2026-08-05T05:00:00Z',
      publishedAgeHours: null,
      latestObservationAgeHours: 0.5,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('częściowe — brak wiarygodnego czasu publikacji')
    expect(markup).not.toContain('aktualne według ostatniego pliku — do 24 h')
    expect(markup).not.toContain('opóźnione — ponad 24 h')
  })

  it('prioritizes missing publication age before missing observation age', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA FIRMS / VIIRS" summary={{
      pointCount: 4,
      publishedAt: null,
      latestObservationAt: null,
      publishedAgeHours: null,
      latestObservationAgeHours: null,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('częściowe — brak wiarygodnego czasu publikacji')
    expect(markup).not.toContain('częściowe — brak wiarygodnego czasu obserwacji')
  })
})
