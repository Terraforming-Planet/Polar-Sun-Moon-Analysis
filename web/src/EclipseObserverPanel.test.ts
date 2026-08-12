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
    expect(source).toContain('nie tworzy fałszywych')
  })

  it('uses Cesium WGS84 ground observer mode with real UTC lighting', () => {
    expect(source).toContain('viewer.scene.globe.enableLighting = true')
    expect(source).toContain('viewer.scene.sun.show = true')
    expect(source).toContain('viewer.scene.moon.show = true')
    expect(source).toContain('Widok obserwatora')
    expect(source).toContain('Cesium.JulianDate.fromIso8601(utc)')
  })
})
