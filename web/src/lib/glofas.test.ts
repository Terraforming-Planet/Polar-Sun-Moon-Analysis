import { describe, expect, it } from 'vitest'
import { newestTemporalEnd, sourceStatusLabel, variableLabel, type GlofasCatalog } from './glofas'

describe('GloFAS hydrology helpers', () => {
  it('uses Polish labels for supported hydrology variables', () => {
    expect(variableLabel('river_discharge')).toBe('Przepływ rzeczny')
    expect(variableLabel('soil_wetness_index_root_zone')).toBe('Wilgotność strefy korzeniowej')
  })

  it('does not describe a down source as available', () => {
    expect(sourceStatusLabel('available')).toBe('DOSTĘPNE')
    expect(sourceStatusLabel('down')).toBe('CHWILOWO NIEDOSTĘPNE')
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
