export type CameraPreset = {
  position: readonly [number, number, number]
  fov: number
}

type VectorLike = {
  x?: number
  y?: number
  z?: number
  set: (x: number, y: number, z: number) => void
}

type CameraLike = {
  position: VectorLike
  fov: number
  updateProjectionMatrix: () => void
}

type ControlsLike = {
  target: VectorLike
  update: () => void
}

type SceneSnapshot = {
  position: readonly [number, number, number]
  target: readonly [number, number, number]
  fov: number
}

function isValidPreset(preset: CameraPreset | null | undefined): preset is CameraPreset {
  return Array.isArray(preset?.position)
    && preset.position.length === 3
    && preset.position.every(Number.isFinite)
    && Number.isFinite(preset.fov)
    && preset.fov > 0
    && preset.fov < 180
}

function hasUsableSceneReferences(
  camera: CameraLike | null,
  controls: ControlsLike | null,
): camera is CameraLike {
  return Boolean(
    camera
    && controls
    && typeof camera.position?.set === 'function'
    && typeof camera.updateProjectionMatrix === 'function'
    && typeof controls.target?.set === 'function'
    && typeof controls.update === 'function',
  )
}

function readVector(vector: VectorLike): readonly [number, number, number] | null {
  const values = [vector.x, vector.y, vector.z]
  return values.every(Number.isFinite)
    ? values as [number, number, number]
    : null
}

function snapshotScene(camera: CameraLike, controls: ControlsLike): SceneSnapshot | null {
  const position = readVector(camera.position)
  const target = readVector(controls.target)
  if (!position || !target || !Number.isFinite(camera.fov)) return null
  return { position, target, fov: camera.fov }
}

function restoreScene(camera: CameraLike, controls: ControlsLike, snapshot: SceneSnapshot | null) {
  if (!snapshot) return
  try {
    camera.position.set(...snapshot.position)
    camera.fov = snapshot.fov
    camera.updateProjectionMatrix()
    controls.target.set(...snapshot.target)
    controls.update()
  } catch {
    // Best effort only: disposed Three.js references can also reject rollback.
  }
}

/**
 * Reapplies a camera preset to the existing Three.js camera and controls.
 * This is intentionally imperative so a reset works even when the selected
 * preset state is already unchanged, without rebuilding the WebGL scene.
 */
export function applyCameraPreset(
  camera: CameraLike | null,
  controls: ControlsLike | null,
  preset: CameraPreset | null | undefined,
): boolean {
  if (!hasUsableSceneReferences(camera, controls) || !controls || !isValidPreset(preset)) return false

  const snapshot = snapshotScene(camera, controls)
  try {
    camera.position.set(...preset.position)
    camera.fov = preset.fov
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
    return true
  } catch {
    // Scene references can become stale during WebGL disposal. Restore the
    // previous camera state when possible instead of leaving a partial reset.
    restoreScene(camera, controls, snapshot)
    return false
  }
}
