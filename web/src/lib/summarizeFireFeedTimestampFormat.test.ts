import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed timestamp normalization', () => {
  const feature = (observation_time: string) => ({
    geometry: { type: 'Point', coordinates: [18.6466, 54.352] },
    properties: {
      categories: ['Fire'],
      source: 'NASA FIRMS',
      observation_time,
    },
  })

  it('normalizes equivalent timezone offsets and keeps observations at publication time', () => {
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

  it('rejects timestamps that omit an explicit ISO time or timezone', () => {
    const ambiguousPublication = summarizeFireFeed({
      generated_at_utc: '08/05/2026 10:00',
      features: [feature('2026-08-05 09:30:00')],
    }, new Date('2026-08-05T12:00:00Z'))

    expect(ambiguousPublication.publishedAt).toBeNull()
    expect(ambiguousPublication.publicationTimestampInvalid).toBe(true)
    expect(ambiguousPublication.latestObservationAt).toBeNull()
    expect(ambiguousPublication.ignoredObservationTimestampCount).toBe(1)

    const missingTimezone = summarizeFireFeed({
      generated_at_utc: '2026-08-05T10:00:00',
      features: [feature('2026-08-05T09:30:00')],
    }, new Date('2026-08-05T12:00:00Z'))

    expect(missingTimezone.publishedAt).toBeNull()
    expect(missingTimezone.publicationTimestampInvalid).toBe(true)
    expect(missingTimezone.latestObservationAt).toBeNull()
    expect(missingTimezone.ignoredObservationTimestampCount).toBe(1)

    const dateOnly = summarizeFireFeed({
      generated_at_utc: '2026-08-05',
      features: [feature('2026-08-05')],
    }, new Date('2026-08-05T12:00:00Z'))

    expect(dateOnly.publishedAt).toBeNull()
    expect(dateOnly.latestObservationAt).toBeNull()
    expect(dateOnly.ignoredObservationTimestampCount).toBe(1)
  })

  it('rejects impossible calendar dates instead of accepting Date.parse normalization', () => {
    const summary = summarizeFireFeed({
      generated_at_utc: '2026-02-30T10:00:00Z',
      features: [
        feature('2026-02-29T09:00:00Z'),
        feature('2026-04-31T09:00:00Z'),
        feature('2024-02-29T09:00:00Z'),
      ],
    }, new Date('2026-05-01T12:00:00Z'))

    expect(summary.publishedAt).toBeNull()
    expect(summary.publicationTimestampInvalid).toBe(true)
    expect(summary.latestObservationAt).toBe('2024-02-29T09:00:00.000Z')
    expect(summary.ignoredObservationTimestampCount).toBe(2)
    expect(summary.latestObservationAgeHours).toBeGreaterThan(0)
  })
})
