import { describe, expect, it } from 'vitest'
import { fireFeedSummary, isFireFeature, isPublishedFirePoint } from './FireDataStatus'

describe('FireDataStatus feature collection validation', () => {
  it('treats a non-array feature collection as unavailable instead of throwing', () => {
    expect(() => fireFeedSummary(null, '2026-08-02T16:00:00Z', Date.parse('2026-08-02T17:00:00Z'))).not.toThrow()
    expect(fireFeedSummary({ features: [] }, '2026-08-02T16:00:00Z', Date.parse('2026-08-02T17:00:00Z'))).toMatchObject({
      pointCount: 0,
      pointAvailability: 'empty-published-file',
      freshness: 'current',
    })
  })

  it('ignores null and primitive entries while preserving valid fire points', () => {
    const summary = fireFeedSummary([
      null,
      17,
      'bad-record',
      {
        geometry: { type: 'Point' },
        properties: { categories: ['Fire'], observation_time: '2026-08-02T15:30:00Z' },
      },
    ], '2026-08-02T16:00:00Z', Date.parse('2026-08-02T17:00:00Z'))

    expect(isFireFeature(null)).toBe(false)
    expect(isPublishedFirePoint('bad-record')).toBe(false)
    expect(summary.pointCount).toBe(1)
    expect(summary.latestObservationUtc).toBe('2026-08-02T15:30:00Z')
  })
})
