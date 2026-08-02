import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  FireDataStatus,
  fireFeedSummary,
  isFireFeature,
  isPublishedFirePoint,
  resolveFireFeedFreshness,
  resolveHazardGeneratedAt,
} from './FireDataStatus'

const features = [
  { geometry: { type: 'Point' }, properties: { categories: ['Wildfires'], observation_time: '2026-08-01T18:00:00Z' } },
  { geometry: { type: 'Point' }, properties: { categories: ['Fire'], observation_time: '2026-08-01T18:30:00Z' } },
  { geometry: { type: 'Point' }, properties: { categories: ['Floods'], observation_time: '2026-08-01T23:30:00Z' } },
]

describe('FireDataStatus', () => {
  it('counts only point geometries in fire categories and calculates publication and observation age', () => {
    const summary = fireFeedSummary(features, '2026-08-01T20:00:00Z', Date.parse('2026-08-02T00:00:00Z'))

    expect(summary.pointCount).toBe(2)
    expect(summary.ageHours).toBe(4)
    expect(summary.generatedAtIsFuture).toBe(false)
    expect(summary.freshness).toBe('current')
    expect(summary.latestObservationUtc).toBe('2026-08-01T18:30:00Z')
    expect(summary.observationAgeHours).toBe(5.5)
    expect(summary.observationIsFuture).toBe(false)
    expect(isFireFeature(features[2])).toBe(false)
  })

  it('matches documented fire category names without accepting unrelated fire substrings', () => {
    expect(isFireFeature({ properties: { categories: [' wildfire '] } })).toBe(true)
    expect(isFireFeature({ properties: { categories: ['WILDFIRES'] } })).toBe(true)
    expect(isFireFeature({ properties: { categories: ['Fireworks'] } })).toBe(false)
    expect(isFireFeature({ properties: { categories: ['Forest fire risk'] } })).toBe(false)
  })

  it('does not report polygons, missing geometry, or flood points as active fire points', () => {
    const polygonFire = {
      geometry: { type: 'Polygon' },
      properties: { categories: ['Wildfire'], observation_time: '2026-08-01T23:00:00Z' },
    }
    const missingGeometryFire = {
      properties: { categories: ['Fire'], observation_time: '2026-08-01T22:00:00Z' },
    }
    const summary = fireFeedSummary(
      [...features, polygonFire, missingGeometryFire],
      '2026-08-01T20:00:00Z',
      Date.parse('2026-08-02T00:00:00Z'),
    )

    expect(isPublishedFirePoint(polygonFire)).toBe(false)
    expect(isPublishedFirePoint(missingGeometryFire)).toBe(false)
    expect(summary.pointCount).toBe(2)
    expect(summary.latestObservationUtc).toBe('2026-08-01T18:30:00Z')
  })

  it('ignores missing and invalid observation timestamps', () => {
    const summary = fireFeedSummary([
      { geometry: { type: 'Point' }, properties: { categories: ['Fire'] } },
      { geometry: { type: 'Point' }, properties: { categories: ['Wildfire'], observation_time: 'not-a-date' } },
    ], '2026-08-01T20:00:00Z', Date.parse('2026-08-02T00:00:00Z'))

    expect(summary.latestObservationUtc).toBeNull()
    expect(summary.observationAgeHours).toBeNull()
    expect(summary.observationIsFuture).toBe(false)
  })

  it('prefers the snake_case catalog timestamp and supports the legacy camelCase field', () => {
    expect(resolveHazardGeneratedAt('2026-08-01T20:00:00Z', '2026-08-01T19:00:00Z'))
      .toBe('2026-08-01T20:00:00Z')
    expect(resolveHazardGeneratedAt(undefined, '2026-08-01T19:00:00Z'))
      .toBe('2026-08-01T19:00:00Z')
  })

  it('classifies publication freshness without pretending stale or missing files are live', () => {
    expect(resolveFireFeedFreshness(24, false)).toBe('current')
    expect(resolveFireFeedFreshness(24.01, false)).toBe('stale')
    expect(resolveFireFeedFreshness(null, false)).toBe('missing')
    expect(resolveFireFeedFreshness(0, true)).toBe('invalid-future')

    const staleHtml = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedAtUtc="2026-07-31T23:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
      />,
    )
    const missingHtml = renderToStaticMarkup(<FireDataStatus features={features} />)

    expect(staleHtml).toContain('Stan świeżości')
    expect(staleHtml).toContain('plik starszy niż 24 h')
    expect(missingHtml).toContain('brak poprawnego czasu publikacji')
  })

  it('renders an explicit source, non-realtime disclosure, and separate ages', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedAtUtc="2026-08-01T20:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
      />,
    )

    expect(html).toContain('Źródło katalogu')
    expect(html).toContain('NASA EONET')
    expect(html).toContain('aktualny opublikowany plik (≤ 24 h)')
    expect(html).toContain('Aktywne punkty w pliku')
    expect(html).toContain('>2<')
    expect(html).toContain('Najnowsza obserwacja punktu')
    expect(html).toContain('Wiek najnowszej obserwacji')
    expect(html).toContain('5.5 h')
    expect(html).toContain('4.0 h')
    expect(html).toContain('wyłącznie geometrie punktowe')
    expect(html).toContain('Nie jest to ciągły obraz czasu rzeczywistego')
  })

  it('allows the published source label to be overridden by the feed adapter', () => {
    const html = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedAtUtc="2026-08-01T20:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
        sourceLabel="NASA FIRMS / VIIRS"
      />,
    )

    expect(html).toContain('NASA FIRMS / VIIRS')
    expect(html).not.toContain('>NASA EONET<')
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

  it('flags future publication and observation timestamps instead of presenting zero-hour freshness', () => {
    const futureFeatures = [
      { geometry: { type: 'Point' }, properties: { categories: ['Fire'], observation_time: '2026-08-02T02:00:00Z' } },
    ]
    const summary = fireFeedSummary(
      futureFeatures,
      '2026-08-02T01:00:00Z',
      Date.parse('2026-08-02T00:00:00Z'),
    )

    expect(summary.ageHours).toBe(0)
    expect(summary.generatedAtIsFuture).toBe(true)
    expect(summary.freshness).toBe('invalid-future')
    expect(summary.observationAgeHours).toBe(0)
    expect(summary.observationIsFuture).toBe(true)

    const html = renderToStaticMarkup(
      <FireDataStatus
        features={futureFeatures}
        generatedAtUtc="2026-08-02T01:00:00Z"
        nowMs={Date.parse('2026-08-02T00:00:00Z')}
      />,
    )

    expect(html).toContain('błędny czas w przyszłości')
    expect(html.match(/czas przyszły — sprawdź zegar lub metadane/g)).toHaveLength(2)
    expect(html).not.toContain('0.0 h')
  })
})
