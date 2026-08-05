import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

function renderWithAges(publishedAgeHours: number, latestObservationAgeHours: number) {
  return renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA FIRMS / VIIRS" summary={{
    pointCount: 1,
    publishedAt: '2026-08-05T05:00:00Z',
    latestObservationAt: '2026-08-05T05:00:00Z',
    publishedAgeHours,
    latestObservationAgeHours,
    publishedInFuture: false,
  }}/>)
}

describe('FireFeedStatus invalid age handling', () => {
  it('does not present non-finite or negative ages as valid freshness data', () => {
    const markup = renderWithAges(Number.NaN, -1)

    expect(markup.match(/>brak danych</g)).toHaveLength(2)
    expect(markup).toContain('nieznana — brak metadanych czasu')
    expect(markup).not.toContain('NaN')
    expect(markup).not.toContain('-1 min')
  })

  it('ignores infinity when deciding whether the feed is current or delayed', () => {
    const markup = renderWithAges(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)

    expect(markup.match(/>brak danych</g)).toHaveLength(2)
    expect(markup).toContain('nieznana — brak metadanych czasu')
    expect(markup).not.toContain('Infinity')
    expect(markup).not.toContain('opóźnione — ponad 24 h')
  })
})
