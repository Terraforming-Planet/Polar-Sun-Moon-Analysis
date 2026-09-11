import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed missing observation timestamps', () => {
  it('does not report an absent observation timestamp as ignored metadata', () => {
    const summary = summarizeFireFeed({
      features: [
        { geometry: { type: 'Point' }, properties: { categories: ['Fire'] } },
        { geometry: { type: 'Point' }, properties: { categories: ['Wildfire'], observation_time: 'not-a-date' } },
      ],
    }, new Date('2026-08-04T12:00:00Z'))

    expect(summary.pointCount).toBe(2)
    expect(summary.latestObservationAt).toBeNull()
    expect(summary.ignoredObservationTimestampCount).toBe(1)
  })

  it('still counts an explicitly present but empty legacy timestamp as ignored', () => {
    const summary = summarizeFireFeed({
      features: [
        { geometry: { type: 'Point' }, properties: { categories: ['Fires'], observationUtc: '   ' } },
      ],
    }, new Date('2026-08-04T12:00:00Z'))

    expect(summary.pointCount).toBe(1)
    expect(summary.ignoredObservationTimestampCount).toBe(1)
  })
})
