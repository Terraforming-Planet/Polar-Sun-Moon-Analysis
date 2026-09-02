import { describe, expect, it } from 'vitest'
import { fireFeedSummary } from './FireDataStatus'

describe('FireDataStatus timestamp selection', () => {
  it('selects the newest valid fire-point observation across mixed timestamp formats', () => {
    const summary = fireFeedSummary([
      {
        geometry: { type: 'Point' },
        properties: {
          categories: ['Fire'],
          observation_time: 'not-a-date',
        },
      },
      {
        geometry: { type: 'Point' },
        properties: {
          categories: ['Wildfire'],
          observation_time: '2026-08-02T10:00:00+02:00',
        },
      },
      {
        geometry: { type: 'Point' },
        properties: {
          categories: ['Wildfires'],
          observation_time: '2026-08-02T08:30:00Z',
        },
      },
      {
        geometry: { type: 'Polygon' },
        properties: {
          categories: ['Fire'],
          observation_time: '2026-08-02T09:00:00Z',
        },
      },
    ], '2026-08-02T09:00:00Z', Date.parse('2026-08-02T10:00:00Z'))

    expect(summary.pointCount).toBe(3)
    expect(summary.latestObservationUtc).toBe('2026-08-02T08:30:00Z')
    expect(summary.observationAgeHours).toBe(1.5)
    expect(summary.metadataConsistency).toBe('consistent')
  })
})
