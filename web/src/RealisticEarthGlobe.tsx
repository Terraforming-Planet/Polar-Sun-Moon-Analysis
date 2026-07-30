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
  const [satelliteMode, setSatelliteMode] = useState(false)

  useEffect(() => {
    setModel(readEarthModel())
  }, [])

  const selectModel = (nextModel: EarthModel) => {
    setSatelliteMode(false)
    setModel(nextModel)
    writeEarthModel(nextModel)
  }

  const stableScientific = (
    <StableEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate={autoRotate} model="scientific" />
  )

  return (
    <div className="earth-viewer-stack">
      <div className="earth-model-switch" role="group" aria-label="Wybór modelu Ziemi">
        <button type="button" className={model === 'scientific' ? 'is-active' : ''} onClick={() => selectModel('scientific')}>
          Scientific WGS84
        </button>
        <button type="button" className={model === 'legacy' ? 'is-active' : ''} onClick={() => selectModel('legacy')}>
          Legacy sphere
        </button>
      </div>

      <p className="earth-model-explainer">
        <strong>{model === 'scientific' ? 'Model naukowy:' : 'Model porównawczy:'}</strong>{' '}
        {model === 'scientific'
          ? 'elipsoida WGS84 uruchamiana najpierw w lekkim i bezpiecznym rendererze. Pełne warstwy satelitarne można włączyć osobno.'
          : 'lekki model kulisty zachowany do porównania i jako tryb awaryjny.'}
      </p>

      {model === 'scientific' && (
        <div className="earth-render-mode" role="group" aria-label="Tryb renderowania modelu naukowego">
          <button type="button" className={!satelliteMode ? 'is-active' : ''} onClick={() => setSatelliteMode(false)}>
            Stabilny model 3D
          </button>
          <button type="button" className={satelliteMode ? 'is-active' : ''} onClick={() => setSatelliteMode(true)}>
            Pełny widok satelitarny Cesium
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
