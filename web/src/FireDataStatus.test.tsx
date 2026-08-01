import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FireDataStatus, fireFeedSummary, isFireFeature } from './FireDataStatus'

const features = [
  { properties: { categories: ['Wildfires'], observation_time: '2026-08-01T18:00:00Z' } },
  { properties: { categories: ['Fire'], observation_time: '2026-08-01T18:30:00Z' } },
  { properties: { categories: ['Floods'], observation_time: '2026-08-01T17:00:00Z' } },
]

describe('FireDataStatus', () => {
  it('counts only fire categories and calculates age from publication time', () => {
    const summary = fireFeedSummary(features, '2026-08-01T20:00:00Z', Date.parse('2026-08-02T00:00:00Z'))

    expect(summary.pointCount).toBe(2)
    expect(summary.ageHours).toBe(4)
    expect(isFireFeature(features[2])).toBe(false)
  })

  it('renders an explicit non-realtime disclosure', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedAtUtc="2026-08-01T20:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
      />,
    )

    expect(html).toContain('Aktywne punkty w pliku')
    expect(html).toContain('>2<')
    expect(html).toContain('4.0 h')
    expect(html).toContain('nie ciągły obraz czasu rzeczywistego')
  })
})
