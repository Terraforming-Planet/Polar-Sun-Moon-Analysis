import { describe, expect, it } from 'vitest'
import globeSource from './RealisticEarthGlobe.tsx?raw'

describe('RealisticEarthGlobe rotation controls', () => {
  it('uses one rotation clock and disables OrbitControls auto-rotation', () => {
    expect(globeSource).toContain('controls.autoRotate = false')
    expect(globeSource).toContain('if (rotationEnabledRef.current)')
    expect(globeSource).toContain('liveAngleRef.current += elapsedSeconds * (Math.PI * 2 / SIDEREAL_DAY_SECONDS)')
    expect(globeSource).not.toContain('controls.autoRotate = rotationEnabled')
    expect(globeSource).not.toContain('controls.autoRotate = autoRotate')
  })

  it('updates the existing rotation ref instead of rebuilding the WebGL scene', () => {
    expect(globeSource).toContain('rotationEnabledRef.current = rotationEnabled')
    expect(globeSource).toContain('}, [rotationEnabled])')
    expect(globeSource).toContain('}, [model, renderedMarkers, textureUrl, mobile])')
    expect(globeSource).not.toContain('}, [model, renderedMarkers, textureUrl, mobile, rotationEnabled])')
  })

  it('keeps the pause and resume action visible and unambiguous', () => {
    expect(globeSource).toContain("rotationEnabled ? '⏸ Zatrzymaj Ziemię i chmury' : '▶ Wznów synchronizację'")
    expect(globeSource).toContain('onClick={() => setRotationEnabled(value => !value)}')
    expect(globeSource).toContain('Pauza zatrzymuje zegar obrotu bez przebudowy sceny')
  })

  it('keeps all rotating layers frozen together and prevents a catch-up jump after resume', () => {
    const previousUpdate = globeSource.indexOf('previous = now')
    const rotationGate = globeSource.indexOf('if (rotationEnabledRef.current)')
    const earthUpdate = globeSource.indexOf('earth.rotation.y = liveAngleRef.current')
    const cloudsUpdate = globeSource.indexOf('clouds.rotation.y = liveAngleRef.current')
    const gridUpdate = globeSource.indexOf('grid.rotation.y = liveAngleRef.current')

    expect(previousUpdate).toBeGreaterThan(-1)
    expect(rotationGate).toBeGreaterThan(previousUpdate)
    expect(earthUpdate).toBeGreaterThan(rotationGate)
    expect(cloudsUpdate).toBeGreaterThan(earthUpdate)
    expect(gridUpdate).toBeGreaterThan(cloudsUpdate)

    expect(globeSource).toContain('const elapsedSeconds = Math.max(0, (now - previous) / 1000)')
    expect(globeSource).not.toContain('if (rotationEnabledRef.current) {\n          previous = now')
  })
})
