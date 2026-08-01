export type EarthViewPreset = 'full' | 'moon' | 'greenwich' | 'dateline' | 'north' | 'south'

export type CameraPreset = {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  label: string
}

export const EARTH_CAMERA_PRESETS: Record<EarthViewPreset, CameraPreset> = {
  full: {
    position: [0, 0.18, 6.1],
    target: [0, 0, 0],
    fov: 42,
    label: 'Pełna tarcza Ziemi',
  },
  moon: {
    position: [0, 0.12, 12.5],
    target: [0, 0, 0],
    fov: 18,
    label: 'Widok z okolic Księżyca',
  },
  greenwich: {
    position: [5.4, 0.15, 0],
    target: [0, 0, 0],
    fov: 38,
    label: 'Południk Greenwich',
  },
  dateline: {
    position: [-5.4, 0.15, 0],
    target: [0, 0, 0],
    fov: 38,
    label: 'Linia zmiany daty',
  },
  north: {
    position: [0.01, 6.2, 0],
    target: [0, 0, 0],
    fov: 38,
    label: 'Biegun północny',
  },
  south: {
    position: [0.01, -6.2, 0],
    target: [0, 0, 0],
    fov: 38,
    label: 'Biegun południowy',
  },
}

export function cameraPresetFor(view: EarthViewPreset): CameraPreset {
  return EARTH_CAMERA_PRESETS[view]
}

export function cameraPresetDistance(view: EarthViewPreset): number {
  const [x, y, z] = cameraPresetFor(view).position
  return Math.hypot(x, y, z)
}
