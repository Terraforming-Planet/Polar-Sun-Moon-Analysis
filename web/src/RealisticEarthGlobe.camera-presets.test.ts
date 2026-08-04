import { describe, expect, it } from 'vitest'
import globeSource from './RealisticEarthGlobe.tsx?raw'

const expectedPresets = [
  "full: { position: [0, 0.18, 6.1], fov: 42",
  "moon: { position: [0, 0.12, 12.5], fov: 18",
  "greenwich: { position: [0, 0.15, 5.4], fov: 38",
  "dateline: { position: [0, 0.15, -5.4], fov: 38",
  "north: { position: [0, 6.2, 0.01], fov: 38",
  "south: { position: [0, -6.2, 0.01], fov: 38",
]

describe('RealisticEarthGlobe camera presets and atmosphere', () => {
  it('keeps every documented camera preset available', () => {
    expectedPresets.forEach(preset => expect(globeSource).toContain(preset))
    expect(globeSource).toContain("type ViewPreset = 'full' | 'moon' | 'greenwich' | 'dateline' | 'north' | 'south'")
  })

  it('applies a preset to the existing camera and shared OrbitControls target', () => {
    expect(globeSource).toContain('const camera = cameraRef.current')
    expect(globeSource).toContain('const controls = controlsRef.current')
    expect(globeSource).toContain('camera.position.set(...preset.position)')
    expect(globeSource).toContain('camera.fov = preset.fov')
    expect(globeSource).toContain('camera.updateProjectionMatrix()')
    expect(globeSource).toContain('controls.target.set(0, 0, 0)')
    expect(globeSource).toContain('controls.update()')
    expect(globeSource).toContain('}, [view])')
  })

  it('does not rebuild the WebGL scene when a camera preset changes', () => {
    expect(globeSource).toContain('}, [model, renderedMarkers, textureUrl, mobile])')
    expect(globeSource).not.toContain('[model, renderedMarkers, textureUrl, mobile, view]')
    expect(globeSource).not.toContain('[view, model, renderedMarkers, textureUrl, mobile]')
  })

  it('keeps the visible two-shell atmosphere and toggles it through a persistent ref', () => {
    expect(globeSource).toContain('EARTH_RADIUS * 1.055')
    expect(globeSource).toContain('opacity: 0.34')
    expect(globeSource).toContain('EARTH_RADIUS * 1.095')
    expect(globeSource).toContain('opacity: 0.12')
    expect(globeSource).toContain('atmosphere.add(inner, outer)')
    expect(globeSource).toContain('atmosphereRef.current.visible = showAtmosphere')
  })

  it('keeps both atmosphere shells aligned with Scientific WGS84 and Legacy sphere', () => {
    expect(globeSource).toContain("if (model === 'scientific') earth.scale.y = POLAR_RATIO")
    expect(globeSource).toContain('inner.scale.copy(earth.scale)')
    expect(globeSource).toContain('outer.scale.copy(earth.scale)')
    expect(globeSource).toContain('atmosphere.visible = showAtmosphere')
    expect(globeSource).not.toContain('inner.scale.y = POLAR_RATIO')
    expect(globeSource).not.toContain('outer.scale.y = POLAR_RATIO')
  })
})
