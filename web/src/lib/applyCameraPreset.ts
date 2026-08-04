export type CameraPreset = {
  position: readonly [number, number, number]
  fov: number
}

type MutableVectorLike = {
  x?: number
  y?: number
  z?: number
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

function readVector(vector: MutableVectorLike): readonly [number, number, number] | null {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)
    ? [vector.x as number, vector.y as number, vector.z as number]
    : null
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
    || !Number.isFinite(camera.fov)
    || typeof camera.position?.set !== 'function'
    || typeof camera.updateProjectionMatrix !== 'function'
    || typeof controls.target?.set !== 'function'
    || typeof controls.update !== 'function'
  ) return false

  const previousPosition = readVector(camera.position)
  const previousTarget = readVector(controls.target)
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
      if (previousPosition) camera.position.set(...previousPosition)
      camera.fov = previousFov
      camera.updateProjectionMatrix()
      if (previousTarget) controls.target.set(...previousTarget)
      controls.update()
    } catch {
      // Best-effort rollback: scene references may have been disposed mid-update.
    }
    return false
  }
}
