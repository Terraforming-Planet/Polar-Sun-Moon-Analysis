import { describe, expect, it } from 'vitest'
import { fireFeedSummary, isFireFeature } from './FireDataStatus'

describe('FireDataStatus malformed input handling', () => {
  it('ignores non-string categories instead of crashing the whole status panel', () => {
    const malformed = {
      geometry: { type: 'Point' },
      properties: { categories: [null, 42, { title: 'Wildfires' }, ' Fire '] },
    }

    expect(() => isFireFeature(malformed)).not.toThrow()
    expect(isFireFeature(malformed)).toBe(true)
  })

  it('ignores non-string observation timestamps and still selects the newest valid point time', () => {
    const summary = fireFeedSummary([
      {
        geometry: { type: 'Point' },
        properties: { categories: ['Fire'], observation_time: 1_754_070_600_000 },
      },
      {
        geometry: { type: 'Point' },
        properties: { categories: ['Wildfire'], observation_time: { utc: '2026-08-01T19:00:00Z' } },
      },
      {
        geometry: { type: 'Point' },
        properties: { categories: ['Wildfires'], observation_time: '2026-08-01T18:30:00Z' },
      },
    ], '2026-08-01T20:00:00Z', Date.parse('2026-08-02T00:00:00Z'))

    expect(summary.pointCount).toBe(3)
    expect(summary.latestObservationUtc).toBe('2026-08-01T18:30:00Z')
    expect(summary.observationAgeHours).toBe(5.5)
  })
})
