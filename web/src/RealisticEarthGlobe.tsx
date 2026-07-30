import { useEffect, useState } from 'react'
import { StableEarthGlobe } from './StableEarthGlobe'
import { readEarthModel, writeEarthModel, type EarthModel } from './lib/earthPreferences'
import { SatelliteSourceRegistry } from './satellite-source-registry'

import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

export function RealisticEarthGlobe({ selectedTime, markers = [], autoRotate = true }: Props) {
  const [model, setModel] = useState<EarthModel>('scientific')

  useEffect(() => {
    setModel(readEarthModel())
  }, [])

  const selectModel = (nextModel: EarthModel) => {
    setModel(nextModel)
    writeEarthModel(nextModel)
  }

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
          ? 'elipsoida WGS84 z poprawnym spłaszczeniem biegunowym i wspólną geometrią markerów.'
          : 'kula referencyjna zachowana do porównania z wcześniejszą wersją projektu.'}
      </p>
      <StableEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate={autoRotate} model={model} />
      <SatelliteSourceRegistry />
    </div>
  )
}
