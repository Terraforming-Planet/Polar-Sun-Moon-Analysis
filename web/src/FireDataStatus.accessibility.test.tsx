import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireDataStatus } from './FireDataStatus'

describe('FireDataStatus accessibility', () => {
  it('announces refreshed published-file status without interrupting the user', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={[
          {
            geometry: { type: 'Point' },
            properties: {
              categories: ['Wildfire'],
              observation_time: '2026-08-02T07:30:00Z',
            },
          },
        ]}
        generatedAtUtc="2026-08-02T08:00:00Z"
        nowMs={Date.parse('2026-08-02T09:00:00Z')}
      />,
    )

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain('Aktywne punkty w pliku')
    expect(html).toContain('>1<')
  })
})
