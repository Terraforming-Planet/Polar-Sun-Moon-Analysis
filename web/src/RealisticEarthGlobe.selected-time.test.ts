import { describe, expect, it } from 'vitest'
import globeSource from './RealisticEarthGlobe.tsx?raw'

describe('RealisticEarthGlobe selected UTC time', () => {
  it('re-synchronizes the existing Earth angle without rebuilding the WebGL scene', () => {
    expect(globeSource).toContain('liveAngleRef.current = utcEarthAngle(selectedTime) - Math.PI / 2')
    expect(globeSource).toContain('}, [selectedTime])')
    expect(globeSource).toContain('}, [model, renderedMarkers, textureUrl, mobile])')
    expect(globeSource).not.toContain('}, [model, renderedMarkers, textureUrl, mobile, selectedTime])')
  })

  it('keeps Earth, clouds and grid synchronized to the same angle after a time change', () => {
    expect(globeSource).toContain('earth.rotation.y = liveAngleRef.current')
    expect(globeSource).toContain('clouds.rotation.y = liveAngleRef.current')
    expect(globeSource).toContain('grid.rotation.y = liveAngleRef.current')
  })

  it('falls back to a deterministic angle for an invalid selected timestamp', () => {
    expect(globeSource).toContain('if (!Number.isFinite(ms)) return 0')
  })
})
