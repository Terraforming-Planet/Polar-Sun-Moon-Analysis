import { describe, expect, it } from 'vitest'
import source from './EclipseObserverPanel.tsx?raw'

describe('EclipseObserverPanel', () => {
  it('keeps Gdansk as the default Polish observer and includes NASA reference sites', () => {
    expect(source).toContain("useState('gdansk')")
    expect(source).toContain("label: 'Gdańsk'")
    expect(source).toContain("label: 'Kraków'")
    expect(source).toContain("label: 'Reykjavík'")
    expect(source).toContain("label: 'León'")
    expect(source).toContain("label: 'Zaragoza'")
    expect(source).toContain("label: 'Valencia'")
  })

  it('separates five-second UI polling from the real NOAA source cadence', () => {
    expect(source).toContain('5_000')
    expect(source).toContain('cadence_minutes')
    expect(source).toContain('SATELLITE_PHOTOGRAPHY = TRUE · SYNTHETIC = FALSE')
    expect(source).toContain('NOAA publikuje Full Disk zwykle co około 10 minut')
  })

  it('offers human aerial orbital and global Cesium camera presets', () => {
    expect(source).toContain('flyToSite(2, 4)')
    expect(source).toContain('flyToSite(5_000, -35)')
    expect(source).toContain('flyToSite(2_500_000, -90, 0)')
    expect(source).toContain('flyToSite(10_000_000, -90, 0)')
    expect(source).toContain('🧍 2 m · człowiek')
    expect(source).toContain('🚁 5 km')
    expect(source).toContain('🛰 2500 km')
  })

  it('renders a clearly labelled NASA-model umbra separately from NOAA imagery', () => {
    expect(source).toContain('const nasaUmbraPath')
    expect(source).toContain('interpolateUmbra')
    expect(source).toContain('2026-08-12T17:02:00Z')
    expect(source).toContain('2026-08-12T18:32:00Z')
    expect(source).toContain('UMBRA · NASA GSFC MODEL')
    expect(source).toContain('To warstwa modelowa, nie fotografia satelitarna')
    expect(source).toContain('NASA GSFC — centralna ścieżka WGS84')
  })

  it('uses Cesium WGS84 with real UTC lighting', () => {
    expect(source).toContain('viewer.scene.globe.enableLighting = true')
    expect(source).toContain('viewer.scene.sun.show = true')
    expect(source).toContain('viewer.scene.moon.show = true')
    expect(source).toContain('Cesium.JulianDate.fromIso8601(utc)')
  })
})
