import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed timestamp normalization', () => {
  it('normalizes equivalent timezone offsets and keeps observations at publication time', () => {
    const feature = (observation_time: string) => ({
      geometry: { type: 'Point', coordinates: [18.6466, 54.352] },
      properties: {
        categories: ['Fire'],
        source: 'NASA FIRMS',
        observation_time,
      },
    })

    const summary = summarizeFireFeed({
      generated_at_utc: '2026-08-05T10:00:00Z',
      features: [
        feature('2026-08-05T10:00:00Z'),
        feature('2026-08-05T11:00:00+01:00'),
        feature('2026-08-05T10:00:01Z'),
      ],
    }, new Date('2026-08-05T12:00:00Z'))

    expect(summary.publishedAt).toBe('2026-08-05T10:00:00.000Z')
    expect(summary.latestObservationAt).toBe('2026-08-05T10:00:00.000Z')
    expect(summary.publishedAgeHours).toBe(2)
    expect(summary.latestObservationAgeHours).toBe(2)
    expect(summary.ignoredObservationTimestampCount).toBe(1)
  })
})
