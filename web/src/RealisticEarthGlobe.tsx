import { LiveNrtEarthGlobe } from './LiveNrtEarthGlobe'
import { SatelliteSourceRegistry } from './satellite-source-registry'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  return (
    <>
      <LiveNrtEarthGlobe selectedTime={selectedTime} markers={markers} />
      <SatelliteSourceRegistry />
    </>
  )
}
