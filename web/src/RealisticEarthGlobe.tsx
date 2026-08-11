import { useEffect, useState } from 'react'
import { RealisticEarthGlobe as CesiumScientificEarth } from './CleanRealisticEarthGlobe'
import { EarthViewerErrorBoundary } from './EarthViewerErrorBoundary'
import { StableEarthGlobe } from './StableEarthGlobe'
import { readEarthModel, writeEarthModel, type EarthModel } from './lib/earthPreferences'
import { SatelliteSourceRegistry } from './satellite-source-registry'

import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

export function RealisticEarthGlobe({ selectedTime, markers = [], autoRotate = true }: Props) {
  const [model, setModel] = useState<EarthModel>('scientific')
  const [satelliteMode, setSatelliteMode] = useState(true)

  useEffect(() => {
    try { setModel(readEarthModel()) } catch { setModel('scientific') }
  }, [])

  const selectModel = (nextModel: EarthModel) => {
    setModel(nextModel)
    if (nextModel === 'scientific') setSatelliteMode(true)
    try { writeEarthModel(nextModel) } catch { /* localStorage can be blocked */ }
  }

  const stableScientific = (
    <StableEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate={autoRotate} model="scientific" />
  )

  return (
    <div className="earth-viewer-stack">
      <div className="earth-model-switch" role="group" aria-label="Wybór modelu Ziemi">
        <button type="button" className={model === 'scientific' ? 'is-active' : ''} onClick={() => selectModel('scientific')}>
          Scientific WGS84 · Cesium
        </button>
        <button type="button" className={model === 'legacy' ? 'is-active' : ''} onClick={() => selectModel('legacy')}>
          Legacy sphere · fallback
        </button>
      </div>

      <p className="earth-model-explainer">
        <strong>{model === 'scientific' ? 'Model naukowy:' : 'Model awaryjny:'}</strong>{' '}
        {model === 'scientific'
          ? 'kafelkowy glob Cesium oparty na elipsoidzie WGS84. Widok łączy warstwy Esri, NASA GIBS, NOAA i Copernicus, a markery zagrożeń są nakładane na ten sam glob.'
          : 'lekki renderer Three.js zachowany wyłącznie jako bezpieczny fallback, gdy WebGL/Cesium lub zewnętrzne kafelki nie są dostępne.'}
      </p>

      {model === 'scientific' && (
        <div className="earth-render-mode" role="group" aria-label="Tryb renderowania modelu naukowego">
          <button type="button" className={satelliteMode ? 'is-active' : ''} onClick={() => setSatelliteMode(true)}>
            Cesium · kafelki satelitarne
          </button>
          <button type="button" className={!satelliteMode ? 'is-active' : ''} onClick={() => setSatelliteMode(false)}>
            Lekki WGS84 · fallback
          </button>
        </div>
      )}

      {model === 'legacy' ? (
        <StableEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate={autoRotate} model="legacy" />
      ) : satelliteMode ? (
        <EarthViewerErrorBoundary fallback={stableScientific}>
          <CesiumScientificEarth selectedTime={selectedTime} markers={markers} />
        </EarthViewerErrorBoundary>
      ) : stableScientific}

      <SatelliteSourceRegistry />
    </div>
  )
}
