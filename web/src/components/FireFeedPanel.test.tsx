import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedPanel } from './FireFeedPanel'

describe('FireFeedPanel', () => {
  it('summarizes the latest published fire file before rendering its status', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      now={new Date('2026-08-03T12:00:00Z')}
      data={{
        generated_at_utc: '2026-08-03T10:00:00Z',
        features: [
          { geometry: { type: 'Point' }, properties: { categories: ['Wildfires'], observation_time: '2026-08-03T09:30:00Z' } },
          { geometry: { type: 'Point' }, properties: { categories: ['Floods'], observation_time: '2026-08-03T09:45:00Z' } },
        ],
      }}
    />)

    expect(markup).toContain('NASA EONET')
    expect(markup).toContain('Punkty pożarowe')
    expect(markup).toContain('>1<')
    expect(markup).toContain('2.0 h')
    expect(markup).toContain('2.5 h')
    expect(markup).toContain('nie jest to ciągły obraz czasu rzeczywistego')
  })

  it('renders an honest empty state for unavailable data', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel=""
      now={new Date('2026-08-03T12:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Punkty pożarowe')
    expect(markup).toContain('>0<')
    expect(markup).toContain('nieznana — brak metadanych czasu')
    expect(markup).not.toContain('0.0 h')
  })

  it('discloses a refresh failure without discarding the last loaded file status', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error="503 data/hazards.json"
      now={new Date('2026-08-03T12:00:00Z')}
      data={{
        generated_at_utc: '2026-08-03T08:00:00Z',
        features: [
          { geometry: { type: 'Point' }, properties: { categories: ['Fire'], observation_time: '2026-08-03T07:30:00Z' } },
        ],
      }}
    />)

    expect(markup).toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(markup).toContain('503 data/hazards.json')
    expect(markup).toContain('ostatnich danych, które udało się wczytać')
    expect(markup).toContain('>1<')
    expect(markup).toContain('4.0 h')
  })

  it('shows refresh progress without claiming that the previous file is newly updated', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      now={new Date('2026-08-03T12:00:00Z')}
      data={{
        generated_at_utc: '2026-08-03T08:00:00Z',
        features: [
          { geometry: { type: 'Point' }, properties: { categories: ['Fire'], observation_time: '2026-08-03T07:30:00Z' } },
        ],
      }}
    />)

    expect(markup).toContain('Sprawdzanie nowszego pliku pożarowego')
    expect(markup).toContain('ostatnich danych, które udało się wczytać')
    expect(markup).toContain('>1<')
    expect(markup).toContain('4.0 h')
    expect(markup).not.toContain('Nie udało się odświeżyć katalogu pożarów')
  })

  it('does not claim previous data during the initial file request', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      now={new Date('2026-08-03T12:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Pobieranie ostatniego opublikowanego pliku pożarowego')
    expect(markup).toContain('Dane nie są jeszcze dostępne')
    expect(markup).not.toContain('ostatnich danych, które udało się wczytać')
  })

  it('reports an initial fetch failure without inventing a previous file', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error="Request timed out"
      now={new Date('2026-08-03T12:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Nie udało się pobrać katalogu pożarów')
    expect(markup).toContain('Brak wcześniej wczytanego pliku')
    expect(markup).not.toContain('status dotyczy ostatnich danych')
  })

  it('prefers a concrete refresh error over the in-progress message', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      error="Request timed out"
      now={new Date('2026-08-03T12:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Nie udało się pobrać katalogu pożarów')
    expect(markup).toContain('Request timed out')
    expect(markup).not.toContain('Pobieranie ostatniego opublikowanego pliku pożarowego')
  })

  it('renders the message from an Error returned by the loader', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error={new Error('Network request failed')}
      now={new Date('2026-08-03T12:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Nie udało się pobrać katalogu pożarów')
    expect(markup).toContain('Network request failed')
  })

  it('keeps refresh progress visible when an older request is aborted', () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'

    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      error={abortError}
      now={new Date('2026-08-03T12:00:00Z')}
      data={{ generated_at_utc: '2026-08-03T11:00:00Z', features: [] }}
    />)

    expect(markup).toContain('Sprawdzanie nowszego pliku pożarowego')
    expect(markup).not.toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(markup).not.toContain('The operation was aborted')
  })

  it('ignores an AbortError-like object crossing a worker or iframe boundary', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      error={{ name: 'AbortError', message: 'The operation was aborted in another realm' }}
      now={new Date('2026-08-03T12:00:00Z')}
      data={{ generated_at_utc: '2026-08-03T11:00:00Z', features: [] }}
    />)

    expect(markup).toContain('Sprawdzanie nowszego pliku pożarowego')
    expect(markup).not.toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(markup).not.toContain('another realm')
  })

  it('renders a message from an error-like object crossing a worker or iframe boundary', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error={{ name: 'NetworkError', message: 'Satellite feed request failed' }}
      now={new Date('2026-08-03T12:00:00Z')}
      data={{ generated_at_utc: '2026-08-03T11:00:00Z', features: [] }}
    />)

    expect(markup).toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(markup).toContain('Satellite feed request failed')
    expect(markup).toContain('ostatnich danych, które udało się wczytać')
  })

  it('does not claim a refresh failure for blank or unsupported error values', () => {
    const blankMarkup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error="   "
      now={new Date('2026-08-03T12:00:00Z')}
      data={{ generated_at_utc: '2026-08-03T11:00:00Z', features: [] }}
    />)
    const objectMarkup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error={{ status: 503 }}
      now={new Date('2026-08-03T12:00:00Z')}
      data={{ generated_at_utc: '2026-08-03T11:00:00Z', features: [] }}
    />)

    expect(blankMarkup).not.toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(objectMarkup).not.toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(blankMarkup).toContain('NASA EONET')
    expect(objectMarkup).toContain('>0<')
  })
})
