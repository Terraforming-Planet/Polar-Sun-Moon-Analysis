import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireDataStatus } from './FireDataStatus'

describe('fire timestamp labels', () => {
  it('describes a missing observation timestamp as an observation problem', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={[{
          geometry: { type: 'Point' },
          properties: { categories: ['Fire'] },
        }]}
        generatedAtUtc="2026-08-02T10:00:00Z"
        nowMs={Date.parse('2026-08-02T11:00:00Z')}
      />,
    )

    expect(html).toContain('Najnowsza obserwacja punktu')
    expect(html).toContain('brak poprawnego czasu obserwacji')
    expect(html).not.toContain('Najnowsza obserwacja punktu</span><b>brak czasu publikacji')
  })

  it('keeps the missing publication message limited to the catalog timestamp row', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={[]}
        nowMs={Date.parse('2026-08-02T11:00:00Z')}
      />,
    )

    expect(html).toContain('Czas publikacji katalogu</span><b>brak czasu publikacji')
    expect(html).toContain('Najnowsza obserwacja punktu</span><b>brak poprawnego czasu obserwacji')
  })
})
