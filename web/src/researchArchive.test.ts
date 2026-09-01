import { describe, expect, it } from 'vitest'

import type { AreaAnalysisResponse } from './lib/evidenceApi'
import {
  buildAssistantAnswerRecord,
  buildResearchFindingRecord,
  buildResearchManifest,
  parseLocalAssistantAnswers,
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
      title: 'Vistula test area',
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
    })).toThrow(/start date/i)

    expect(() => buildResearchManifest({
      title: 'no analysis', latitude: 0, longitude: 0, radiusKm: 10,
      startDate: '2025-01-01', endDate: '2026-01-01', analyses: [],
    })).toThrow(/at least one/i)
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
        headline: 'Result',
        what_is_visible: 'Visible water.',
        change_over_time: 'Changes require matched-season comparison.',
        water_assessment: 'Water is present.',
        notable_features: ['shoreline'],
        confidence: { level: 'medium', reason: 'Two visual samples.' },
        limitations: ['cloud cover'],
        recommended_next_step: 'Retrieve original scenes.',
      },
      evidence_policy: 'official-public-only',
    }

    const finding = buildResearchFindingRecord(analysis, new Date('2026-08-21T00:10:00Z'))
    expect(finding.schema).toBe('terra-research-finding/v1')
    expect(finding.privacy_note).toBe('raw-chat-not-included')
    expect(finding.source_images).toHaveLength(2)
    expect(finding.conclusion.headline).toBe('Result')
    expect(JSON.stringify(finding)).not.toContain('"messages":')
    expect(JSON.stringify(finding)).not.toContain('private user question')

    const parsed = parseLocalResearchFindings(JSON.stringify([finding, { schema: 'terra-research-finding/v1', privacy_note: 'raw-chat-included' }]))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(finding.id)
  })

  it('rejects a partial finding that would crash the archive after its delayed load', () => {
    const partial = {
      schema: 'terra-research-finding/v1',
      id: 'partial-finding',
      title: 'Incomplete old record',
      privacy_note: 'raw-chat-not-included',
      source_images: [],
      conclusion: {},
    }

    expect(parseLocalResearchFindings(JSON.stringify([partial]))).toEqual([])
  })

  it('stores an assistant answer without ever storing the matching user prompt', () => {
    const record = buildAssistantAnswerRecord({
      answer: 'The assistant found two candidate channels that require DEM verification.',
      model: 'gpt-5.6-terra',
      place: { label: 'Test area', latitude: 53.59, longitude: 19.01 },
    }, new Date('2026-08-21T00:30:00Z'))

    const serialized = JSON.stringify(record)
    expect(record.schema).toBe('terra-assistant-answer/v1')
    expect(record.privacy_note).toBe('user-prompt-not-stored')
    expect(serialized).toContain('candidate channels')
    expect(serialized).not.toContain('"prompt":')
    expect(serialized).not.toContain('"question":')
    expect(serialized).not.toContain('"messages":')

    const parsed = parseLocalAssistantAnswers(JSON.stringify([
      record,
      { ...record, id: 'bad', prompt: 'private text' },
      { ...record, id: 'bad2', privacy_note: 'user-prompt-stored' },
      { ...record, id: 'bad3', user_text: 'private text hidden under another key' },
      { ...record, id: 'bad4', place: { ...record.place, private_note: 'do not retain this' } },
    ]))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(record.id)
    expect(Object.keys(parsed[0]).sort()).toEqual(['answer', 'id', 'model', 'place', 'privacy_note', 'saved_at_utc', 'schema'].sort())
  })
})
