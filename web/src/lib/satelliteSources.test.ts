import { describe, expect, it } from 'vitest'
import { chooseSatelliteSource, zoomLevelFromDistance } from './satelliteSources'

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
