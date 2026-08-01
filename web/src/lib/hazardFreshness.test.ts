import { describe, expect, it } from 'vitest'
import { isFirePoint, selectFirePoints, summarizeFireCatalog } from './hazardFreshness'

describe('hazard freshness', () => {
  it('counts only valid point features classified as fires', () => {
    const catalog = {
      generated_at_utc: '2026-08-01T04:00:00Z',
      features: [
        { geometry: { type: 'Point', coordinates: [19.94, 50.06] }, properties: { categories: ['wildfires'] } },
        { geometry: { type: 'Point', coordinates: [181, 50.06] }, properties: { categories: ['wildfires'] } },
        { geometry: { type: 'Point', coordinates: [19.94, 50.06] }, properties: { categories: ['floods'] } },
        { geometry: { type: 'Polygon', coordinates: [] }, properties: { categories: ['fires'] } },
      ],
    }

    expect(catalog.features.map(isFirePoint)).toEqual([true, false, false, false])
    expect(selectFirePoints(catalog)).toEqual([catalog.features[0]])
    expect(summarizeFireCatalog(catalog, Date.parse('2026-08-01T06:00:00Z'))).toEqual({
      pointCount: 1,
      generatedAtUtc: '2026-08-01T04:00:00Z',
      ageHours: 2,
      status: 'available',
    })
  })

  it('accepts documented fire category spelling and rejects unrelated events', () => {
    const features = [
      { geometry: { type: 'Point', coordinates: [10, 20] }, properties: { categories: [' Fire '] } },
      { geometry: { type: 'Point', coordinates: [11, 21] }, properties: { categories: ['wildfire'] } },
      { geometry: { type: 'Point', coordinates: [12, 22] }, properties: { categories: ['severeStorms'] } },
    ]

    expect(selectFirePoints({ features })).toEqual(features.slice(0, 2))
  })

  it('reports an empty published snapshot without calling it live', () => {
    expect(summarizeFireCatalog({
      generatedUtc: '2026-08-01T05:30:00Z',
      features: [],
    }, Date.parse('2026-08-01T06:00:00Z'))).toEqual({
      pointCount: 0,
      generatedAtUtc: '2026-08-01T05:30:00Z',
      ageHours: 0.5,
      status: 'empty',
    })
  })

  it('keeps missing timestamps explicit instead of inventing freshness', () => {
    expect(summarizeFireCatalog({ features: [] }, Date.parse('2026-08-01T06:00:00Z'))).toEqual({
      pointCount: 0,
      generatedAtUtc: null,
      ageHours: null,
      status: 'missing-timestamp',
    })
  })
})
