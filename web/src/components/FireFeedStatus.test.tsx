import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedStatus } from './FireFeedStatus'

describe('FireFeedStatus', () => {
  it('shows source, point count, publication metadata and an explicit non-live limitation', () => {
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