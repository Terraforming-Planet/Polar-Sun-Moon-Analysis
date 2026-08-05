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

describe('FireFeedStatus sub-minute age formatting', () => {
  it('does not round a positive age below one minute down to zero', () => {
    const markup = renderWithAges(0.5 / 60, 0.25 / 60)

    expect(markup.match(/&lt; 1 min/g)).toHaveLength(2)
    expect(markup).not.toContain('>0 min<')
  })

  it('keeps an exact zero age distinct from a small positive age', () => {
    const markup = renderWithAges(0, 1 / 60)

    expect(markup).toContain('>0 min<')
    expect(markup).toContain('>1 min<')
  })
})
