import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed timestamp format', () => {
  it('accepts only unambiguous ISO 8601 timestamps with an explicit timezone', () => {
    const feature = (observation_time: unknown) => ({
      geometry: { type: 'Point', coordinates: [18.6466, 54.352] },
      properties: {
        categories: ['Fire'],
        source: 'NASA FIRMS',
        observation_time,
      },
    })

    const summary = summarizeFireFeed({
      generated_at_utc: '08/05/2026 12:00',
      features: [
        feature('2026-08-05T10:00:00Z'),
        feature('2026-08-05T11:00:00+01:00'),
        feature('08/05/2026 11:30'),
        feature('2026-08-05T11:45:00'),
      ],
    }, new Date('2026-08-05T12:00:00Z'))

    expect(summary.publicationTimestampInvalid).toBe(true)
    expect(summary.publishedAt).toBeNull()
    expect(summary.latestObservationAt).toBe('2026-08-05T10:00:00.000Z')
    expect(summary.ignoredObservationTimestampCount).toBe(2)
  })
})
