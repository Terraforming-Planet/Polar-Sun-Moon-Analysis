import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

describe('FireFeedStatus', () => {
  it('shows point count, publication metadata and an explicit non-live limitation', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus summary={{
      pointCount: 37,
      publishedAt: '2026-08-03T10:00:00.000Z',
      latestObservationAt: '2026-08-03T09:30:00.000Z',
      publishedAgeHours: 2,
      latestObservationAgeHours: 2.5,
    }}/>)

    expect(markup).toContain('Punkty pożarowe')
    expect(markup).toContain('37')
    expect(markup).toContain('Wiek pliku')
    expect(markup).toContain('2.0 h')
    expect(markup).toContain('Wiek obserwacji')
    expect(markup).toContain('2.5 h')
    expect(markup).toContain('Ostatni opublikowany plik')
    expect(markup).toContain('nie jest to ciągły obraz czasu rzeczywistego')
  })

  it('does not invent timestamps or ages when metadata is missing', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus summary={{
      pointCount: 0,
      publishedAt: null,
      latestObservationAt: null,
      publishedAgeHours: null,
      latestObservationAgeHours: null,
    }}/>)

    expect(markup.match(/brak danych/g)).toHaveLength(4)
    expect(markup).not.toContain('0.0 h')
  })
})
