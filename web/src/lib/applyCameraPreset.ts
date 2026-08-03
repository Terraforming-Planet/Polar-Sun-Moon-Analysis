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

function isValidPreset(preset: CameraPreset) {
  return preset.position.every(Number.isFinite)
    && Number.isFinite(preset.fov)
    && preset.fov > 0
    && preset.fov < 180
}

/**
 * Reapplies a camera preset to the existing Three.js camera and controls.
 * This is intentionally imperative so a reset works even when the selected
 * preset state is already unchanged, without rebuilding the WebGL scene.
 */
export function applyCameraPreset(
  camera: CameraLike | null,
  controls: ControlsLike | null,
  preset: CameraPreset,
): boolean {
  if (!camera || !controls || !isValidPreset(preset)) return false

  camera.position.set(...preset.position)
  camera.fov = preset.fov
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
  return true
}
