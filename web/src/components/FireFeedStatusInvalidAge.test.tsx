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
  it('prioritizes invalid publication age when both ages are unusable', () => {
    const markup = renderWithAges(Number.NaN, -1)

    expect(markup.match(/>brak danych</g)).toHaveLength(2)
    expect(markup).toContain('częściowe — brak wiarygodnego czasu publikacji')
    expect(markup).not.toContain('częściowe — brak wiarygodnego czasu obserwacji')
    expect(markup).not.toContain('NaN')
    expect(markup).not.toContain('-1 min')
  })

  it('prioritizes infinite publication age before invalid observation age', () => {
    const markup = renderWithAges(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)

    expect(markup.match(/>brak danych</g)).toHaveLength(2)
    expect(markup).toContain('częściowe — brak wiarygodnego czasu publikacji')
    expect(markup).not.toContain('częściowe — brak wiarygodnego czasu obserwacji')
    expect(markup).not.toContain('Infinity')
    expect(markup).not.toContain('opóźnione — ponad 24 h')
  })

  it('does not call observations current when only the publication age is valid', () => {
    for (const invalidObservationAge of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const markup = renderWithAges(0.5, invalidObservationAge)

      expect(markup).toContain('częściowe — brak wiarygodnego czasu obserwacji')
      expect(markup).not.toContain('aktualne według ostatniego pliku — do 24 h')
      expect(markup).not.toContain('opóźnione — ponad 24 h')
    }
  })
})
