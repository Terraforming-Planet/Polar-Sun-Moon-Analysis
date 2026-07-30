import { describe, expect, it } from 'vitest'
import source from './CleanRealisticEarthGlobe.tsx?raw'

describe('Cesium globe lifecycle regression guards', () => {
  it('does not recreate the Cesium viewer when markers change', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*?new Cesium\.Viewer[\s\S]*?\}, \[view\]\)/)
    expect(source).not.toMatch(/new Cesium\.Viewer[\s\S]*?\}, \[view, markers\]\)/)
  })

  it('updates marker entities independently and requests a render', () => {
    expect(source).toMatch(/viewer\.entities\.removeAll\(\)[\s\S]*?markers\.slice\(0, 500\)[\s\S]*?viewer\.scene\.requestRender\(\)[\s\S]*?\}, \[ready, view, markers\]\)/)
  })

  it('disconnects resize observation and destroys the viewer idempotently', () => {
    expect(source).toContain('resizeObserverRef.current?.disconnect()')
    expect(source).toContain('if (viewer && !viewer.isDestroyed()) viewer.destroy()')
    expect(source).toContain('if (viewerRef.current === viewer) viewerRef.current = null')
  })

  it('keeps a base imagery layer before adding optional overlays', () => {
    const removeAllIndex = source.indexOf('viewer.imageryLayers.removeAll()')
    const baseIndex = source.indexOf('const base = viewer.imageryLayers.addImageryProvider')
    const safeAddIndex = source.indexOf('const safeAdd =')

    expect(removeAllIndex).toBeGreaterThan(-1)
    expect(baseIndex).toBeGreaterThan(removeAllIndex)
    expect(safeAddIndex).toBeGreaterThan(baseIndex)
    expect(source).toContain('Pozostawiono mapę bazową.')
  })

  it('keeps a visible fallback while Cesium is not ready', () => {
    expect(source).toContain('!ready && <div className="tiled-earth-fallback" role="status">')
    expect(source).toContain('<div ref={host} className="tiled-earth-canvas" />')
  })
})
