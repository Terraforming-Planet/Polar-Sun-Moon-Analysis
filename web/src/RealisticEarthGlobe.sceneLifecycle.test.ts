import { describe, expect, it } from 'vitest'
import globeSource from './RealisticEarthGlobe.tsx?raw'

describe('RealisticEarthGlobe scene lifecycle', () => {
  it('keeps runtime controls outside the WebGL scene effect dependencies', () => {
    expect(globeSource).toContain('}, [model, renderedMarkers, textureUrl, mobile])')
    expect(globeSource).not.toContain('textureUrl, selectedTime, showClouds')
    expect(globeSource).not.toContain('showDayNight, view, rotationEnabled])')
  })

  it('updates rotation and visible layers through persistent refs', () => {
    expect(globeSource).toContain('rotationEnabledRef.current = rotationEnabled')
    expect(globeSource).toContain('cloudsRef.current.visible = showClouds')
    expect(globeSource).toContain('atmosphereRef.current.visible = showAtmosphere')
    expect(globeSource).toContain('gridRef.current.visible = showGrid')
    expect(globeSource).toContain('if (rotationEnabledRef.current)')
  })

  it('moves camera presets without reconstructing the renderer', () => {
    expect(globeSource).toContain('camera.position.set(...preset.position)')
    expect(globeSource).toContain('camera.updateProjectionMatrix()')
    expect(globeSource).toContain('}, [view])')
  })

  it('mounts the honest satellite source status for AUTO and manual modes', () => {
    expect(globeSource).toContain("import { SatelliteSourceStatusPanel } from './SatelliteSourceStatusPanel'")
    expect(globeSource).toContain('<SatelliteSourceStatusPanel')
    expect(globeSource).toContain('source={selectedSource}')
    expect(globeSource).toContain('logicalZoom={logicalZoom}')
    expect(globeSource).toContain("tilesConnected: false")
    expect(globeSource).toContain("sourceMode === 'auto' ? 'AUTO — najlepsze dostępne' : 'Ręczny wybór'")
  })
})
