import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedPanel } from './FireFeedPanel'

describe('FireFeedPanel error punctuation', () => {
  it('does not duplicate punctuation from a loader error', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error="Request timed out."
      now={new Date('2026-08-04T02:00:00Z')}
      data={null}
    />)

    expect(markup).toContain('Request timed out. Brak wcześniej wczytanego pliku.')
    expect(markup).not.toContain('Request timed out..')
  })

  it('adds a sentence ending when the loader message has none', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      error="Request timed out"
      now={new Date('2026-08-04T02:00:00Z')}
      data={{ generated_at_utc: '2026-08-04T01:00:00Z', features: [] }}
    />)

    expect(markup).toContain('Request timed out. Poniższy status dotyczy ostatnich danych')
  })
})
