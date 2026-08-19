import { describe, expect, it } from 'vitest'
import globeSource from './RealisticEarthGlobe.tsx?raw'
import cesiumSource from './CleanRealisticEarthGlobe.tsx?raw'

describe('RealisticEarthGlobe scene lifecycle', () => {
  it('uses Cesium as the only public scientific renderer with an error boundary', () => {
    expect(globeSource).toContain("import { RealisticEarthGlobe as CesiumScientificEarth } from './CleanRealisticEarthGlobe'")
    expect(globeSource).toContain("import { EarthViewerErrorBoundary } from './EarthViewerErrorBoundary'")
    expect(globeSource).toContain('<CesiumScientificEarth selectedTime={selectedTime} markers={stableMarkers} />')
    expect(globeSource).toContain('<EarthViewerErrorBoundary fallback={<ScientificViewerFailure />}>')
    expect(globeSource).not.toContain('satelliteMode')
  })

  it('does not expose synthetic WGS84 or legacy sphere switches', () => {
    expect(globeSource).not.toContain('Lekki WGS84 · fallback')
    expect(globeSource).not.toContain('Legacy sphere · fallback')
    expect(globeSource).not.toContain('StableEarthGlobe')
    expect(globeSource).not.toContain('readEarthModel')
    expect(globeSource).toContain(
      'We do not replace the scientific viewer with an artificial fallback sphere or fabricated texture',
    )
  })

  it('stabilizes unchanged hazard markers so periodic JSON refreshes do not recreate Cesium', () => {
    expect(globeSource).toContain('function markerSignature(markers: Marker[])')
    expect(globeSource).toContain('markerCache.current.signature !== signature')
    expect(globeSource).toContain('const stableMarkers = markerCache.current.markers')
  })

  it('updates Cesium hazard entities separately from Viewer initialization', () => {
    expect(cesiumSource).toContain('viewer.entities.removeAll()')
    expect(cesiumSource).toContain('markerCssColor(marker)')
    expect(cesiumSource).toContain('viewer.scene.requestRender()')
    expect(cesiumSource).toContain('}, [view, constrainedDevice])')
    expect(cesiumSource).toContain('}, [ready, view, markers, constrainedDevice])')
    expect(cesiumSource).not.toContain('}, [view, markers])')
  })

  it('preserves per-marker color, size and ground clamping for flood and fire overlays', () => {
    expect(cesiumSource).toContain('pixelSize: Math.max(5, Math.min(12, 6 + (marker.radius ?? 1)))')
    expect(cesiumSource).toContain('color: Cesium.Color.fromCssColorString(markerCssColor(marker))')
    expect(cesiumSource).toContain('heightReference: Cesium.HeightReference.CLAMP_TO_GROUND')
    expect(cesiumSource).toContain('const markerLimit = constrainedDevice ? 250 : 500')
    expect(cesiumSource).toContain('markers.slice(0, markerLimit)')
  })

  it('uses the same UTC instant for physical day/night lighting on every globe layer', () => {
    expect(cesiumSource).toContain(
      'viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(date.toISOString())',
    )
    expect(cesiumSource).toContain('viewer.scene.globe.enableLighting = solarLighting')
    expect(cesiumSource).toContain('real-time Sun lighting')
    expect(cesiumSource).not.toContain('disabled={cloudCoverageMode}')
  })

  it('uses tiled Cesium imagery and request-render mode in the scientific viewer', () => {
    expect(cesiumSource).toContain('new Cesium.Viewer')
    expect(cesiumSource).toContain('requestRenderMode: true')
    expect(cesiumSource).toContain('UrlTemplateImageryProvider')
    expect(cesiumSource).toContain('WebMapTileServiceImageryProvider')
    expect(cesiumSource).toContain('NASA_WMTS')
    expect(cesiumSource).toContain('CDSE_WMS')
  })

  it('keeps the source registry visible next to the scientific renderer', () => {
    expect(globeSource).toContain("import { SatelliteSourceRegistry } from './satellite-source-registry'")
    expect(globeSource).toContain('<SatelliteSourceRegistry />')
  })
})
