import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  FireDataStatus,
  fireFeedSummary,
  isFireFeature,
  resolveHazardGeneratedAt,
} from './FireDataStatus'

const features = [
  { properties: { categories: ['Wildfires'], observation_time: '2026-08-01T18:00:00Z' } },
  { properties: { categories: ['Fire'], observation_time: '2026-08-01T18:30:00Z' } },
  { properties: { categories: ['Floods'], observation_time: '2026-08-01T23:30:00Z' } },
]

describe('FireDataStatus', () => {
  it('counts only fire categories and calculates publication and observation age', () => {
    const summary = fireFeedSummary(features, '2026-08-01T20:00:00Z', Date.parse('2026-08-02T00:00:00Z'))

    expect(summary.pointCount).toBe(2)
    expect(summary.ageHours).toBe(4)
    expect(summary.latestObservationUtc).toBe('2026-08-01T18:30:00Z')
    expect(summary.observationAgeHours).toBe(5.5)
    expect(isFireFeature(features[2])).toBe(false)
  })

  it('ignores missing and invalid observation timestamps', () => {
    const summary = fireFeedSummary([
      { properties: { categories: ['Fire'] } },
      { properties: { categories: ['Wildfire'], observation_time: 'not-a-date' } },
    ], '2026-08-01T20:00:00Z', Date.parse('2026-08-02T00:00:00Z'))

    expect(summary.latestObservationUtc).toBeNull()
    expect(summary.observationAgeHours).toBeNull()
  })

  it('prefers the snake_case catalog timestamp and supports the legacy camelCase field', () => {
    expect(resolveHazardGeneratedAt('2026-08-01T20:00:00Z', '2026-08-01T19:00:00Z'))
      .toBe('2026-08-01T20:00:00Z')
    expect(resolveHazardGeneratedAt(undefined, '2026-08-01T19:00:00Z'))
      .toBe('2026-08-01T19:00:00Z')
  })

  it('renders an explicit non-realtime disclosure and separate ages', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedAtUtc="2026-08-01T20:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
      />,
    )

    expect(html).toContain('Aktywne punkty w pliku')
    expect(html).toContain('>2<')
    expect(html).toContain('Najnowsza obserwacja punktu')
    expect(html).toContain('Wiek najnowszej obserwacji')
    expect(html).toContain('5.5 h')
    expect(html).toContain('4.0 h')
    expect(html).toContain('nie ciągły obraz czasu rzeczywistego')
  })

  it('calculates age when the published file uses generatedUtc', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedUtc="2026-08-01T18:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
      />,
    )

    expect(html).toContain('6.0 h')
    expect(html).not.toContain('brak czasu publikacji')
  })
})
