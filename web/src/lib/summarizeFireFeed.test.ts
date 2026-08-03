import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed', () => {
  it('counts only fire points and reports publication and observation age', () => {
    const summary = summarizeFireFeed({
      generated_at_utc: '2026-08-03T10:00:00Z',
      features: [
        { geometry: { type: 'Point' }, properties: { categories: ['Wildfires'], observation_time: '2026-08-03T09:30:00Z' } },
        { geometry: { type: 'Point' }, properties: { categories: ['Fire'], observation_time: '2026-08-03T09:45:00+00:00' } },
        { geometry: { type: 'Polygon' }, properties: { categories: ['Wildfires'], observation_time: '2026-08-03T09:55:00Z' } },
        { geometry: { type: 'Point' }, properties: { categories: ['Floods'], observation_time: '2026-08-03T09:59:00Z' } },
      ],
    }, new Date('2026-08-03T12:00:00Z'))

    expect(summary).toEqual({
      pointCount: 2,
      publishedAt: '2026-08-03T10:00:00.000Z',
      latestObservationAt: '2026-08-03T09:45:00.000Z',
      publishedAgeHours: 2,
      latestObservationAgeHours: 2.25,
    })
  })

  it('supports the legacy generatedUtc field', () => {
    const summary = summarizeFireFeed({
      generatedUtc: '2026-08-03T08:00:00Z',
      features: [],
    }, new Date('2026-08-03T09:00:00Z'))

    expect(summary.publishedAt).toBe('2026-08-03T08:00:00.000Z')
    expect(summary.publishedAgeHours).toBe(1)
  })

  it('does not turn future or malformed timestamps into a fake zero-hour age', () => {
    const summary = summarizeFireFeed({
      generated_at_utc: '2026-08-03T13:00:00Z',
      features: [
        { geometry: { type: 'Point' }, properties: { categories: ['Wildfire'], observation_time: 'not-a-date' } },
      ],
    }, new Date('2026-08-03T12:00:00Z'))

    expect(summary.pointCount).toBe(1)
    expect(summary.publishedAgeHours).toBeNull()
    expect(summary.latestObservationAt).toBeNull()
    expect(summary.latestObservationAgeHours).toBeNull()
  })

  it('handles missing and malformed feature collections safely', () => {
    expect(summarizeFireFeed(null)).toMatchObject({ pointCount: 0, publishedAt: null })
    expect(summarizeFireFeed({ features: 'invalid' })).toMatchObject({ pointCount: 0, latestObservationAt: null })
  })
})
