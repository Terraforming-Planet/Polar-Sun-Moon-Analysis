import { describe, expect, it } from 'vitest'

import type { AreaAnalysisResponse } from './lib/evidenceApi'
import {
  buildResearchFindingRecord,
  buildResearchManifest,
  parseLocalResearchArchive,
  parseLocalResearchFindings,
} from './researchArchive'
import { PUBLIC_RESEARCH_TESTS } from './researchCatalog'

describe('researchArchive', () => {
  it('publishes the complete TEST 001-016 archive and marks guarded AI cases explicitly', () => {
    expect(PUBLIC_RESEARCH_TESTS).toHaveLength(16)
    expect(PUBLIC_RESEARCH_TESTS.map(item => item.testId)).toEqual(Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(3, '0')))
    expect(PUBLIC_RESEARCH_TESTS.filter(item => item.aiCaseId).map(item => item.testId)).toEqual(['001', '011', '013', '014', '015'])
  })

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
    expect(manifest.area).toEqual({ type: 'point-radius', latitude: 53.66, longitude: 18.79, radius_km: 80, shape: 'circle' })
    expect(manifest.temporal_scope).toEqual({ start_date: '1990-01-01', end_date: '2026-12-31', mode: 'custom' })
    expect(manifest.satellite_sources).toEqual(['NASA_GIBS', 'USGS_LANDSAT_STAC'])
    expect(manifest.analyses).toEqual(['water-change', 'hydrology', 'terrain'])
  })

  it('persists explicit AOI shape and time mode without changing schema version', () => {
    const manifest = buildResearchManifest({
      title: 'triangle autumn area',
      latitude: 53.5,
      longitude: 19,
      radiusKm: 40,
      shape: 'triangle',
      startDate: '2025-09-01',
      endDate: '2025-11-30',
      temporalPreset: 'autumn',
      analyses: ['multispectral'],
    }, new Date('2026-08-20T14:30:00Z'))

    expect(manifest.schema).toBe('terra-research-manifest/v1')
    expect(manifest.area.shape).toBe('triangle')
    expect(manifest.temporal_scope.mode).toBe('autumn')
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

  it('keeps compatible v1 local archive entries', () => {
    const legacy = {
      schema: 'terra-research-manifest/v1',
      id: 'legacy',
      created_at_utc: '2026-08-20T14:30:00Z',
      status: 'draft',
      title: 'legacy draft',
      area: { type: 'point-radius', latitude: 10, longitude: 20, radius_km: 30 },
      temporal_scope: { start_date: '2020-01-01', end_date: '2021-01-01' },
      analyses: ['multispectral'],
      evidence_policy: 'official-public-only',
      notes: '',
    }
    const parsed = parseLocalResearchArchive(JSON.stringify([legacy, { id: 'fake' }, null]))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('legacy')
    expect(parsed[0].area.shape).toBeUndefined()
  })

  it('archives only source images and analysis findings, never raw chat messages', () => {
    const analysis: AreaAnalysisResponse = {
      service: 'terra-observation-area-analysis-v2',
      generated_at_utc: '2026-08-21T00:00:00Z',
      area: { place_name: 'Lake Tana', latitude: 12, longitude: 37.25, radius_km: 25 },
      period: { start_date: '2020-01-01', end_date: '2026-08-21' },
      depth: 'quick',
      preview_images: [
        { date: '2026-08-21', source: 'Copernicus Data Space · Sentinel-2 L2A true-colour WMS', url: 'https://example.test/sentinel.jpg' },
        { date: '2025-08-21', source: 'NASA GIBS · VIIRS', url: 'https://example.test/viirs.jpg' },
      ],
      ai_visual_image_count: 2,
      landsat_catalog: {
        matched: 10,
        returned: 1,
        scenes: [{ id: 'LC09', date: '2026-08-20', platform: 'LANDSAT_9', cloud_cover: 2 }],
        query_url: 'https://example.test/query',
        full_catalog_url: 'https://example.test/catalog',
      },
      analysis: {
        headline: 'Wynik',
        what_is_visible: 'Widoczna woda.',
        change_over_time: 'Zmiany wymagają matched-season.',
        water_assessment: 'Woda obecna.',
        notable_features: ['linia brzegowa'],
        confidence: { level: 'medium', reason: 'Dwie próbki wizualne.' },
        limitations: ['zachmurzenie'],
        recommended_next_step: 'Pobrać sceny oryginalne.',
      },
      evidence_policy: 'official-public-only',
    }

    const finding = buildResearchFindingRecord(analysis, new Date('2026-08-21T00:10:00Z'))
    expect(finding.schema).toBe('terra-research-finding/v1')
    expect(finding.privacy_note).toBe('raw-chat-not-included')
    expect(finding.source_images).toHaveLength(2)
    expect(finding.conclusion.headline).toBe('Wynik')
    expect(JSON.stringify(finding)).not.toContain('messages')
    expect(JSON.stringify(finding)).not.toContain('Treść prywatnej rozmowy testowej')

    const parsed = parseLocalResearchFindings(JSON.stringify([finding, { schema: 'terra-research-finding/v1', privacy_note: 'raw-chat-included' }]))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(finding.id)
  })
})
