import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireFeedPanel } from './FireFeedPanel'

describe('FireFeedPanel loading accessibility', () => {
  it('marks the fire feed region busy only while a request is active', () => {
    const refreshingMarkup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      data={{ generated_at_utc: '2026-08-04T00:00:00Z', features: [] }}
    />)
    const idleMarkup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      data={{ generated_at_utc: '2026-08-04T00:00:00Z', features: [] }}
    />)

    expect(refreshingMarkup).toContain('aria-busy="true"')
    expect(idleMarkup).toContain('aria-busy="false"')
  })

  it('clears the busy state when a concrete refresh error is shown', () => {
    const markup = renderToStaticMarkup(<FireFeedPanel
      sourceLabel="NASA EONET"
      isRefreshing
      error="Request timed out"
      data={{ generated_at_utc: '2026-08-04T00:00:00Z', features: [] }}
    />)

    expect(markup).toContain('aria-busy="false"')
    expect(markup).toContain('Nie udało się odświeżyć katalogu pożarów')
    expect(markup).not.toContain('Sprawdzanie nowszego pliku pożarowego')
  })
})
