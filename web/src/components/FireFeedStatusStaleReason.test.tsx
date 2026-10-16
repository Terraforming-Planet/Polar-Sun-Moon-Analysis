import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

function renderWithAges(publishedAgeHours: number, latestObservationAgeHours: number) {
  return renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA FIRMS / VIIRS" summary={{
    pointCount: 1,
    publishedAt: '2026-08-04T00:00:00Z',
    latestObservationAt: '2026-08-04T00:00:00Z',
    publishedAgeHours,
    latestObservationAgeHours,
    publishedInFuture: false,
  }}/>)
}

describe('FireFeedStatus stale reason', () => {
  it('identifies a stale publication with a recent observation', () => {
    const markup = renderWithAges(25, 2)

    expect(markup).toContain('opóźnione — plik ponad 24 h')
    expect(markup).not.toContain('opóźnione — obserwacja ponad 24 h')
  })

  it('identifies a stale observation in a recently published file', () => {
    const markup = renderWithAges(2, 25)

    expect(markup).toContain('opóźnione — obserwacja ponad 24 h')
    expect(markup).not.toContain('opóźnione — plik ponad 24 h')
  })

  it('identifies when both the file and observation are stale', () => {
    const markup = renderWithAges(25, 48)

    expect(markup).toContain('opóźnione — plik i obserwacja ponad 24 h')
  })

  it('keeps the inclusive 24 hour boundary current', () => {
    const markup = renderWithAges(24, 24)

    expect(markup).toContain('aktualne według ostatniego pliku — do 24 h')
    expect(markup).not.toContain('opóźnione')
  })
})
