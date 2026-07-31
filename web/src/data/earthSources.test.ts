import { describe, expect, it } from 'vitest'
import { activeEarthSources, EARTH_SOURCES } from './earthSources'

describe('Earth imagery provenance registry', () => {
  it('uses unique source identifiers', () => {
    const ids = EARTH_SOURCES.map(source => source.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('documents institution, product type, time, resolution and license', () => {
    for (const source of EARTH_SOURCES) {
      expect(source.institution.trim()).not.toBe('')
      expect(source.productType.trim()).not.toBe('')
      expect(source.resolution.trim()).not.toBe('')
      expect(source.observationPeriod.trim()).not.toBe('')
      expect(source.license.trim()).not.toBe('')
      expect(source.processingNote.trim()).not.toBe('')
    }
  })

  it('does not claim that a global surface mosaic is one simultaneous raw photograph', () => {
    const surface = EARTH_SOURCES.find(source => source.kind === 'surface-mosaic')
    expect(surface).toBeDefined()
    expect(surface?.productType.toLowerCase()).toContain('mosaic')
    expect(surface?.productType.toLowerCase()).toContain('not one simultaneous raw photograph')
  })

  it('marks only implemented layers as active', () => {
    expect(activeEarthSources().map(source => source.id)).toEqual(['wgs84', 'atmosphere'])
  })
})
