import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed official category objects', () => {
  it('counts documented title and id category objects without guessing unknown fields', () => {
    const summary = summarizeFireFeed({
      generated_at_utc: '2026-08-05T10:00:00Z',
      features: [
        {
          geometry: { type: 'Point', coordinates: [18.6466, 54.352] },
          properties: {
            categories: [{ id: 'wildfires', title: 'Wildfires' }],
            source: 'NASA EONET',
            observation_time: '2026-08-05T09:45:00Z',
          },
        },
        {
          geometry: { type: 'Point', coordinates: [85.324, 27.7172] },
          properties: {
            categories: [{ id: 'fire' }],
            source: 'NASA EONET',
            observation_time: '2026-08-05T09:30:00Z',
          },
        },
        {
          geometry: { type: 'Point', coordinates: [19.9445, 50.0647] },
          properties: {
            categories: [{ name: 'Wildfires' }],
            source: 'Undocumented category field',
            observation_time: '2026-08-05T09:55:00Z',
          },
        },
      ],
    }, new Date('2026-08-05T12:00:00Z'))

    expect(summary.pointCount).toBe(2)
    expect(summary.sourceLabels).toEqual(['NASA EONET'])
    expect(summary.latestObservationAt).toBe('2026-08-05T09:45:00.000Z')
    expect(summary.ignoredObservationTimestampCount).toBe(0)
  })
})
