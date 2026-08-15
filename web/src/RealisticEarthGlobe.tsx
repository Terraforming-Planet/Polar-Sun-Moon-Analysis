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
        <strong>Model Ziemi 3D nie został uruchomiony</strong>
        <span>Cesium / WebGL albo źródło kafelków jest chwilowo niedostępne.</span>
        <small>
          Nie pokazujemy zastępczej, umownej kuli ani sztucznej tekstury. Odśwież stronę lub spróbuj ponownie po zmianie połączenia.
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
        <strong>Model naukowy:</strong>{' '}
        Cesium na elipsoidzie WGS84 z kafelkami źródeł oficjalnych. To jedyny publiczny renderer Ziemi; nie przełączamy użytkownika na umowną kulę zastępczą.
      </p>

      <EarthViewerErrorBoundary fallback={<ScientificViewerFailure />}>
        <CesiumScientificEarth selectedTime={selectedTime} markers={stableMarkers} />
      </EarthViewerErrorBoundary>

      <SatelliteSourceRegistry />
    </div>
  )
}
