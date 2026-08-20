import { describe, expect, it } from 'vitest'

import { buildResearchManifest, parseLocalResearchArchive } from './researchArchive'

describe('researchArchive', () => {
  it('builds a bounded official-public-only research manifest', () => {
    const manifest = buildResearchManifest({
      title: 'Wisła test area',
      latitude: 53.66,
      longitude: 18.79,
      radiusKm: 80,
      startDate: '1990-01-01',
      endDate: '2026-12-31',
      analyses: ['water-change', 'hydrology', 'terrain'],
      notes: 'compare public satellite and hydrological evidence',
    }, new Date('2026-08-20T14:30:00Z'))

    expect(manifest.schema).toBe('terra-research-manifest/v1')
    expect(manifest.evidence_policy).toBe('official-public-only')
    expect(manifest.area).toEqual({ type: 'point-radius', latitude: 53.66, longitude: 18.79, radius_km: 80 })
    expect(manifest.temporal_scope).toEqual({ start_date: '1990-01-01', end_date: '2026-12-31' })
    expect(manifest.analyses).toEqual(['water-change', 'hydrology', 'terrain'])
  })

  it('rejects invalid coordinates, date order and empty analysis selection', () => {
    expect(() => buildResearchManifest({
      title: 'bad latitude', latitude: 91, longitude: 0, radiusKm: 10,
      startDate: '2020-01-01', endDate: '2021-01-01', analyses: ['terrain'],
    })).toThrow(/-90…90/)

    expect(() => buildResearchManifest({
      title: 'bad date', latitude: 0, longitude: 0, radiusKm: 10,
      startDate: '2026-01-01', endDate: '2025-01-01', analyses: ['terrain'],
    })).toThrow(/Data początkowa/)

    expect(() => buildResearchManifest({
      title: 'no analysis', latitude: 0, longitude: 0, radiusKm: 10,
      startDate: '2025-01-01', endDate: '2026-01-01', analyses: [],
    })).toThrow(/przynajmniej jeden/)
  })

  it('ignores malformed local archive entries', () => {
    const valid = buildResearchManifest({
      title: 'valid', latitude: 10, longitude: 20, radiusKm: 30,
      startDate: '2020-01-01', endDate: '2021-01-01', analyses: ['multispectral'],
    }, new Date('2026-08-20T14:30:00Z'))
    const parsed = parseLocalResearchArchive(JSON.stringify([valid, { id: 'fake' }, null]))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(valid.id)
  })
})
