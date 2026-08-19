import { useRef } from 'react'
import { RealisticEarthGlobe as CesiumScientificEarth } from './CleanRealisticEarthGlobe'
import { EarthViewerErrorBoundary } from './EarthViewerErrorBoundary'
import { SatelliteSourceRegistry } from './satellite-source-registry'

import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

function markerSignature(markers: Marker[]) {
  let signature = `${markers.length}`
  for (const marker of markers) {
    signature += `|${marker.latitude.toFixed(5)},${marker.longitude.toFixed(5)},${marker.color ?? 0},${marker.radius ?? 0}`
  }
  return signature
}

function ScientificViewerFailure() {
  return (
    <section className="stable-earth-shell earth-viewer-failure" role="alert">
      <div className="stable-earth-head">
        <strong>The scientific 3D Earth model could not start</strong>
        <span>Cesium / WebGL or the selected imagery source is temporarily unavailable.</span>
        <small>
          We do not replace the scientific viewer with an artificial fallback sphere or fabricated texture. Refresh the page or try again after the connection changes.
        </small>
      </div>
    </section>
  )
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const markerCache = useRef<{ signature: string; markers: Marker[] }>({ signature: '', markers: [] })
  const signature = markerSignature(markers)
  if (markerCache.current.signature !== signature) markerCache.current = { signature, markers }
  const stableMarkers = markerCache.current.markers

  return (
    <div className="earth-viewer-stack">
      <p className="earth-model-explainer">
        <strong>Scientific model:</strong>{' '}
        Cesium on the WGS84 ellipsoid with tiled imagery from official sources. This is the public scientific Earth renderer; it is not replaced by an artificial texture sphere.
      </p>

      <EarthViewerErrorBoundary fallback={<ScientificViewerFailure />}>
        <CesiumScientificEarth selectedTime={selectedTime} markers={stableMarkers} />
      </EarthViewerErrorBoundary>

      <SatelliteSourceRegistry />
    </div>
  )
}
