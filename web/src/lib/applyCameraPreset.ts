export type CameraPreset = {
  position: readonly [number, number, number]
  fov: number
}

type MutableVectorLike = {
  x: number
  y: number
  z: number
  set: (x: number, y: number, z: number) => void
}

type CameraLike = {
  position: MutableVectorLike
  fov: number
  updateProjectionMatrix: () => void
}

type ControlsLike = {
  target: MutableVectorLike
  update: () => void
}

export function applyCameraPreset(
  camera: CameraLike | null | undefined,
  controls: ControlsLike | null | undefined,
  preset: CameraPreset | null | undefined,
): boolean {
  if (!camera || !controls || !preset) return false

  const { position, fov } = preset
  const distanceSquared = Array.isArray(position) && position.length === 3
    ? position.reduce((sum, coordinate) => sum + coordinate * coordinate, 0)
    : 0

  if (
    !Array.isArray(position)
    || position.length !== 3
    || !position.every(Number.isFinite)
    || !Number.isFinite(distanceSquared)
    || distanceSquared <= Number.EPSILON
    || !Number.isFinite(fov)
    || fov <= 0
    || fov >= 180
    || !Number.isFinite(camera.position?.x)
    || !Number.isFinite(camera.position?.y)
    || !Number.isFinite(camera.position?.z)
    || !Number.isFinite(camera.fov)
    || !Number.isFinite(controls.target?.x)
    || !Number.isFinite(controls.target?.y)
    || !Number.isFinite(controls.target?.z)
    || typeof camera.position?.set !== 'function'
    || typeof camera.updateProjectionMatrix !== 'function'
    || typeof controls.target?.set !== 'function'
    || typeof controls.update !== 'function'
  ) return false

  const previousPosition = [camera.position.x, camera.position.y, camera.position.z] as const
  const previousTarget = [controls.target.x, controls.target.y, controls.target.z] as const
  const previousFov = camera.fov

  try {
    camera.position.set(position[0], position[1], position[2])
    camera.fov = fov
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
    return true
  } catch {
    try {
      camera.position.set(...previousPosition)
      camera.fov = previousFov
      camera.updateProjectionMatrix()
      controls.target.set(...previousTarget)
      controls.update()
    } catch {
      // Best-effort rollback: scene references may have been disposed mid-update.
    }
    return false
  }
}
