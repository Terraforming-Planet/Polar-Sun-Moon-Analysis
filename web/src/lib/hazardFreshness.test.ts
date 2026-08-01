import { describe, expect, it } from 'vitest'
import {
  formatFireSnapshotStatus,
  isFirePoint,
  selectFirePoints,
  summarizeFireCatalog,
} from './hazardFreshness'

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

  it('formats an available snapshot without pretending it is a continuous live feed', () => {
    expect(formatFireSnapshotStatus({
      pointCount: 124,
      generatedAtUtc: '2026-08-01T05:30:00Z',
      ageHours: 0.5,
      status: 'available',
    })).toEqual({
      headline: '124 aktywnych punktów pożarowych',
      detail: 'Ostatni opublikowany snapshot — nie ciągły przekaz na żywo.',
      freshness: 'wiek danych: 30 min',
    })
  })

  it('formats empty and timestamp-missing snapshots explicitly', () => {
    expect(formatFireSnapshotStatus({
      pointCount: 0,
      generatedAtUtc: '2026-08-01T04:00:00Z',
      ageHours: 2,
      status: 'empty',
    })).toEqual({
      headline: '0 aktywnych punktów pożarowych',
      detail: 'Ostatni opublikowany snapshot nie zawiera punktów pożarowych.',
      freshness: 'wiek danych: 2.0 h',
    })

    expect(formatFireSnapshotStatus({
      pointCount: 7,
      generatedAtUtc: null,
      ageHours: null,
      status: 'missing-timestamp',
    })).toEqual({
      headline: '7 aktywnych punktów pożarowych',
      detail: 'Brak czasu wygenerowania pliku — świeżość danych jest nieznana.',
      freshness: 'wiek danych: nieznany',
    })
  })
})
