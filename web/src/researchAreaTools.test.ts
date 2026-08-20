import { describe, expect, it } from 'vitest'

import {
  buildLandsatProxyUrl,
  buildLandsatStacUrl,
  buildNasaGibsPreviewUrl,
  representativeResearchDates,
} from './ResearchDataPreview'
import { pointInResearchArea, researchAreaBounds } from './researchGeometry'
import { parseResearchLocation } from './researchLocation'
import { periodForPreset } from './researchTime'

describe('research area tools', () => {
  it('parses Google Maps coordinates and plain coordinates without an API key', () => {
    expect(parseResearchLocation('https://www.google.com/maps/@53.5914,19.010717,12z')).toEqual({ latitude: 53.5914, longitude: 19.010717 })
    expect(parseResearchLocation('https://www.google.com/maps/search/?api=1&query=53.66%2C18.79')).toEqual({ latitude: 53.66, longitude: 18.79 })
    expect(parseResearchLocation('53.5914, 19.010717')).toEqual({ latitude: 53.5914, longitude: 19.010717 })
    expect(parseResearchLocation('not a location')).toBeNull()
  })

  it('builds seasonal annual and decade periods', () => {
    expect(periodForPreset('summer', 2025, '2025-07-01', { startDate: '', endDate: '' })).toEqual({ startDate: '2025-06-01', endDate: '2025-08-31' })
    expect(periodForPreset('winter', 2024, '2024-01-01', { startDate: '', endDate: '' })).toEqual({ startDate: '2023-12-01', endDate: '2024-02-29' })
    expect(periodForPreset('decade', 1996, '1996-01-01', { startDate: '', endDate: '' })).toEqual({ startDate: '1990-01-01', endDate: '1999-12-31' })
  })

  it('applies circle square and triangle AOI membership', () => {
    const center = { latitude: 0, longitude: 0 }
    expect(pointInResearchArea({ latitude: 0, longitude: 0.5 }, center, 100, 'circle')).toBe(true)
    expect(pointInResearchArea({ latitude: 0, longitude: 1.2 }, center, 100, 'circle')).toBe(false)
    expect(pointInResearchArea({ latitude: 0.7, longitude: 0.7 }, center, 100, 'square')).toBe(true)
    expect(pointInResearchArea({ latitude: 0.7, longitude: 0 }, center, 100, 'triangle')).toBe(true)
    expect(pointInResearchArea({ latitude: 0.8, longitude: 0.8 }, center, 100, 'triangle')).toBe(false)
  })

  it('creates bounded official NASA GIBS and USGS Landsat requests', () => {
    const bounds = researchAreaBounds(53.5914, 19.010717, 25)
    expect(bounds.west).toBeLessThan(19.010717)
    expect(bounds.east).toBeGreaterThan(19.010717)

    const gibs = buildNasaGibsPreviewUrl(53.5914, 19.010717, 25, '2026-08-20')
    expect(gibs).toContain('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?')
    expect(gibs).toContain('MODIS_Terra_CorrectedReflectance_TrueColor')
    expect(gibs).toContain('TIME=2026-08-20')

    const landsat = buildLandsatStacUrl(53.5914, 19.010717, 25, '1990-01-01', '1999-12-31')
    expect(landsat).toContain('https://landsatlook.usgs.gov/stac-server/collections/landsat-c2l2-sr/items?')
    expect(landsat).toContain('bbox=')
    expect(decodeURIComponent(landsat)).toContain('1990-01-01T00:00:00Z/1999-12-31T23:59:59Z')

    const relay = buildLandsatProxyUrl('https://terra.example.workers.dev/', 53.5914, 19.010717, 25, '1990-01-01', '1999-12-31')
    expect(relay).toContain('https://terra.example.workers.dev/research/landsat?')
    expect(decodeURIComponent(relay)).toContain('start=1990-01-01')
    expect(decodeURIComponent(relay)).toContain('end=1999-12-31')
    expect(relay).not.toContain('landsatlook.usgs.gov')
  })

  it('uses GIBS only from MODIS Terra availability and clamps future dates', () => {
    expect(representativeResearchDates('1990-01-01', '2026-12-31', new Date('2026-08-20T12:00:00Z'))).toEqual([
      '2000-02-24',
      '2013-05-23',
      '2026-08-20',
    ])
    expect(representativeResearchDates('1990-01-01', '1999-12-31', new Date('2026-08-20T12:00:00Z'))).toEqual([])
  })
})
