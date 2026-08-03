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

  try {
    camera.position.set(...preset.position)
    camera.fov = preset.fov
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
    return true
  } catch {
    // Scene references can become stale during WebGL disposal. A reset must
    // never crash the React tree or trigger a renderer rebuild as recovery.
    return false
  }
}
