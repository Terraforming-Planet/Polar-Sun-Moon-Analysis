export type CameraPreset = {
  position: readonly [number, number, number]
  fov: number
}

type CameraLike = {
  position: { set: (x: number, y: number, z: number) => void }
  fov: number
  updateProjectionMatrix: () => void
}

type ControlsLike = {
  target: { set: (x: number, y: number, z: number) => void }
  update: () => void
}

export function applyCameraPreset(
  camera: CameraLike | null | undefined,
  controls: ControlsLike | null | undefined,
  preset: CameraPreset | null | undefined,
): boolean {
  if (!camera || !controls || !preset) return false

  const { position, fov } = preset
  if (
    !Array.isArray(position)
    || position.length !== 3
    || !position.every(Number.isFinite)
    || !Number.isFinite(fov)
    || fov <= 0
    || fov >= 180
    || typeof camera.position?.set !== 'function'
    || typeof camera.updateProjectionMatrix !== 'function'
    || typeof controls.target?.set !== 'function'
    || typeof controls.update !== 'function'
  ) return false

  try {
    camera.position.set(position[0], position[1], position[2])
    camera.fov = fov
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
    return true
  } catch {
    return false
  }
}
