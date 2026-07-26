import { RealisticEarthGlobe as CleanEarthViewer } from './CleanRealisticEarthGlobe'
import { SatelliteSourceRegistry } from './satellite-source-registry'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  return (
    <>
      <CleanEarthViewer selectedTime={selectedTime} markers={markers} />
      <SatelliteSourceRegistry />
    </>
  )
}
