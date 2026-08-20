import { describe, expect, it } from 'vitest'
import { newestTemporalEnd, sourceStatusLabel, variableLabel, type GlofasCatalog } from './glofas'

describe('GloFAS hydrology helpers', () => {
  it('uses English labels for supported hydrology variables', () => {
    expect(variableLabel('river_discharge')).toBe('River discharge')
    expect(variableLabel('soil_wetness_index_root_zone')).toBe('Root-zone soil wetness')
  })

  it('does not describe a down source as available', () => {
    expect(sourceStatusLabel('available')).toBe('AVAILABLE')
    expect(sourceStatusLabel('down')).toBe('TEMPORARILY UNAVAILABLE')
  })

  it('selects the newest published temporal end across sources', () => {
    const catalog: GlofasCatalog = {
      sources: [
        { id: 'historical', title: 'Historical', provider: 'Copernicus', status: 'down', catalogue_url: 'https://example.test/a', temporal_end_utc: '2026-08-08T00:00:00Z' },
        { id: 'forecast', title: 'Forecast', provider: 'Copernicus', status: 'available', catalogue_url: 'https://example.test/b', temporal_end_utc: '2026-08-10T00:00:00Z' },
      ],
    }
    expect(newestTemporalEnd(catalog)).toBe('2026-08-10T00:00:00Z')
  })
})
