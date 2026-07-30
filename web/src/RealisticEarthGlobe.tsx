import { StableEarthGlobe } from './StableEarthGlobe'
import { SatelliteSourceRegistry } from './satellite-source-registry'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

export function RealisticEarthGlobe({ selectedTime, markers = [], autoRotate = true }: Props) {
  return (
    <>
      <StableEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate={autoRotate} />
      <SatelliteSourceRegistry />
    </>
  )
}
