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

  it('renders the message from an Error returned by the loader', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error={new Error('Network request failed')}
      now={new Date('2026-08-03T12:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(markup).toContain('Network request failed')
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
