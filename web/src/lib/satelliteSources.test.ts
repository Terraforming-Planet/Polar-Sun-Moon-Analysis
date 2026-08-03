import { describe, expect, it } from 'vitest'
import { chooseSatelliteSource, formatSatelliteSourceStatus, SATELLITE_SOURCES, zoomLevelFromDistance } from './satelliteSources'

describe('chooseSatelliteSource', () => {
  it('uses NASA GIBS for a global view', () => {
    expect(chooseSatelliteSource({ zoom: 2 }).id).toBe('nasa-gibs')
  })

  it('uses Sentinel-2 for a clear regional optical view', () => {
    expect(chooseSatelliteSource({ zoom: 10, cloudCoverPercent: 5, hasCoverage: true }).id).toBe('sentinel-2')
  })

  it('uses Sentinel-1 for flood mode and heavy cloud', () => {
    expect(chooseSatelliteSource({ zoom: 10, cloudCoverPercent: 90, hasCoverage: true, floodMode: true }).id).toBe('sentinel-1')
  })

  it('uses local orthophoto only at very high zoom', () => {
    expect(chooseSatelliteSource({ zoom: 18, hasCoverage: true }).id).toBe('local-ortho')
  })
})

describe('formatSatelliteSourceStatus', () => {
  it('shows observation time, age, resolution, cloud cover and confirmed coverage', () => {
    const source = SATELLITE_SOURCES.find(item => item.id === 'sentinel-2')!
    const status = formatSatelliteSourceStatus(source, {
      observedAtUtc: '2026-08-01T08:00:00Z',
      cloudCoverPercent: 17.4,
      hasCoverage: true,
      tilesConnected: true,
    }, Date.parse('2026-08-01T10:30:00Z'))

    expect(status.observationTime).toBe('2026-08-01T08:00:00.000Z')
    expect(status.age).toBe('2.5 h')
    expect(status.resolution).toBe('około 10 m/piksel')
    expect(status.cloudCover).toBe('17%')
    expect(status.coverage).toBe('pokrycie potwierdzone')
    expect(status.rendering).toBe('kafle źródłowe są podłączone')
  })

  it('does not pretend that a selected source is already rendered', () => {
    const source = SATELLITE_SOURCES.find(item => item.id === 'nasa-gibs')!
    const status = formatSatelliteSourceStatus(source)

    expect(status.observationTime).toBe('brak czasu obserwacji')
    expect(status.age).toBe('wiek nieznany')
    expect(status.coverage).toBe('pokrycie niezweryfikowane')
    expect(status.rendering).toContain('tekstury bazowej 2K')
  })

  it('labels Sentinel-1 as cloud independent', () => {
    const source = SATELLITE_SOURCES.find(item => item.id === 'sentinel-1')!
    const status = formatSatelliteSourceStatus(source, { cloudCoverPercent: 100 })

    expect(status.cloudCover).toBe('niezależne od zachmurzenia')
  })
})

describe('zoomLevelFromDistance', () => {
  it('increases logical zoom as altitude above the surface decreases', () => {
    expect(zoomLevelFromDistance(2.05)).toBeGreaterThan(zoomLevelFromDistance(8))
  })

  it('reaches local-detail LOD close to the surface on desktop', () => {
    expect(zoomLevelFromDistance(2.05)).toBeGreaterThanOrEqual(18)
  })

  it('keeps a conservative maximum on mobile devices', () => {
    expect(zoomLevelFromDistance(2.0001, 2, true)).toBe(16)
  })

  it('does not report high LOD for full-disc views', () => {
    expect(zoomLevelFromDistance(40)).toBeLessThanOrEqual(2)
  })
})
