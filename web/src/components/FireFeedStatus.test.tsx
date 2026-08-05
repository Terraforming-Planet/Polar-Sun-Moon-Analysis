import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

describe('FireFeedStatus', () => {
  it('shows detected point sources before the adapter fallback label', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="Adapter fallback" summary={{
      pointCount: 2,
      sourceLabels: ['NASA FIRMS / VIIRS', 'NASA EONET'],
      publishedAt: '2026-08-03T10:00:00.000Z',
      latestObservationAt: '2026-08-03T09:30:00.000Z',
      publishedAgeHours: 2,
      latestObservationAgeHours: 2.5,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('NASA FIRMS / VIIRS, NASA EONET')
    expect(markup).not.toContain('Adapter fallback')
  })

  it('deduplicates detected point sources defensively before display', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="Adapter fallback" summary={{
      pointCount: 3,
      sourceLabels: [' NASA EONET ', 'nasa eonet', 'NASA FIRMS / VIIRS'],
      publishedAt: '2026-08-03T10:00:00.000Z',
      latestObservationAt: '2026-08-03T09:30:00.000Z',
      publishedAgeHours: 2,
      latestObservationAgeHours: 2.5,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('NASA EONET, NASA FIRMS / VIIRS')
    expect(markup).not.toContain('NASA EONET, nasa eonet')
    expect(markup).not.toContain('Adapter fallback')
  })

  it('uses the explicit adapter source only when points do not expose a source', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 37,
      publishedAt: '2026-08-03T10:00:00.000Z',
      latestObservationAt: '2026-08-03T09:30:00.000Z',
      publishedAgeHours: 2,
      latestObservationAgeHours: 2.5,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('Źródło katalogu')
    expect(markup).toContain('NASA EONET')
    expect(markup).toContain('Punkty pożarowe')
    expect(markup).toContain('37')
    expect(markup).toContain('Wiek pliku')
    expect(markup).toContain('2.0 h')
    expect(markup).toContain('Wiek obserwacji')
    expect(markup).toContain('2.5 h')
    expect(markup).toContain('Stan świeżości')
    expect(markup).toContain('aktualne według ostatniego pliku — do 24 h')
    expect(markup).toContain('Ostatni opublikowany plik')
    expect(markup).toContain('nie jest to ciągły obraz czasu rzeczywistego')
  })

  it('marks a feed with points but no trustworthy observation time as partial', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 12,
      publishedAt: '2026-08-03T10:00:00.000Z',
      latestObservationAt: null,
      publishedAgeHours: 1,
      latestObservationAgeHours: null,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('częściowe — brak wiarygodnego czasu obserwacji')
    expect(markup).not.toContain('aktualne według ostatniego pliku — do 24 h')
  })

  it('marks the feed as delayed when either published data or observations exceed 24 hours', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 5,
      publishedAt: '2026-08-02T12:00:00.000Z',
      latestObservationAt: '2026-08-02T10:00:00.000Z',
      publishedAgeHours: 23,
      latestObservationAgeHours: 25,
      publishedInFuture: false,
    }}/>)

    expect(markup).toContain('opóźnione — ponad 24 h')
    expect(markup).not.toContain('aktualne według ostatniego pliku — do 24 h')
  })

  it('warns instead of calling a future publication timestamp current', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 5,
      publishedAt: '2026-08-03T13:00:00.000Z',
      latestObservationAt: '2026-08-03T11:30:00.000Z',
      publishedAgeHours: null,
      latestObservationAgeHours: 0.5,
      publishedInFuture: true,
    }}/>)

    expect(markup).toContain('niespójne — czas publikacji jest w przyszłości')
    expect(markup).not.toContain('aktualne według ostatniego pliku — do 24 h')
  })

  it('warns when the publication timestamp exists but is malformed', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 5,
      publishedAt: null,
      latestObservationAt: '2026-08-03T11:30:00.000Z',
      publishedAgeHours: null,
      latestObservationAgeHours: 0.5,
      publishedInFuture: false,
      publicationTimestampInvalid: true,
    }}/>)

    expect(markup).toContain('niespójne — nieprawidłowy czas publikacji')
    expect(markup).not.toContain('aktualne według ostatniego pliku — do 24 h')
    expect(markup).not.toContain('nieznana — brak metadanych czasu')
  })

  it('shows how many malformed or impossible observation timestamps were ignored', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="NASA EONET" summary={{
      pointCount: 5,
      publishedAt: '2026-08-03T12:00:00.000Z',
      latestObservationAt: '2026-08-03T11:30:00.000Z',
      publishedAgeHours: 1,
      latestObservationAgeHours: 1.5,
      publishedInFuture: false,
      ignoredObservationTimestampCount: 2,
    }}/>)

    expect(markup).toContain('Pominięte znaczniki czasu obserwacji: 2')
    expect(markup).toContain('Punkty pozostają w liczniku')
    expect(markup).toContain('błędne lub niemożliwe czasy nie wyznaczają najnowszej obserwacji')
    expect(markup).toContain('role="note"')
  })

  it('does not invent source, timestamps, ages or freshness when metadata is missing', () => {
    const markup = renderToStaticMarkup(<FireFeedStatus sourceLabel="   " summary={{
      pointCount: 0,
      publishedAt: null,
      latestObservationAt: null,
      publishedAgeHours: null,
      latestObservationAgeHours: null,
      publishedInFuture: false,
    }}/>)

    expect(markup.match(/brak danych/g)).toHaveLength(5)
    expect(markup).toContain('nieznana — brak metadanych czasu')
    expect(markup).not.toContain('0.0 h')
    expect(markup).not.toContain('Pominięte znaczniki czasu obserwacji')
  })
})