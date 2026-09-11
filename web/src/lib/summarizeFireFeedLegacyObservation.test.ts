import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('fire observation timestamp compatibility', () => {
  it('uses observationUtc when the current observation_time field is absent', () => {
    const summary = summarizeFireFeed({
      generated_at_utc: '2026-08-03T10:00:00Z',
      features: [
        {
          geometry: { type: 'Point' },
          properties: {
            categories: ['Wildfires'],
            observationUtc: '2026-08-03T09:45:00Z',
          },
        },
      ],
    }, new Date('2026-08-03T12:00:00Z'))

    expect(summary.pointCount).toBe(1)
    expect(summary.latestObservationAt).toBe('2026-08-03T09:45:00.000Z')
    expect(summary.latestObservationAgeHours).toBe(2.25)
    expect(summary.ignoredObservationTimestampCount).toBe(0)
  })

  it('does not hide a malformed current observation_time behind observationUtc', () => {
    const summary = summarizeFireFeed({
      generated_at_utc: '2026-08-03T10:00:00Z',
      features: [
        {
          geometry: { type: 'Point' },
          properties: {
            categories: ['Fire'],
            observation_time: 'not-a-date',
            observationUtc: '2026-08-03T09:45:00Z',
          },
        },
      ],
    }, new Date('2026-08-03T12:00:00Z'))

    expect(summary.pointCount).toBe(1)
    expect(summary.latestObservationAt).toBeNull()
    expect(summary.latestObservationAgeHours).toBeNull()
    expect(summary.ignoredObservationTimestampCount).toBe(1)
  })
})
