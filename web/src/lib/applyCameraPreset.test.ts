import { describe, expect, it, vi } from 'vitest'
import { applyCameraPreset } from './applyCameraPreset'

const preset = {
  position: [0, 0.18, 6.1] as const,
  fov: 42,
}

describe('applyCameraPreset', () => {
  it('reapplies the full preset even when React state does not change', () => {
    const positionSet = vi.fn()
    const updateProjectionMatrix = vi.fn()
    const targetSet = vi.fn()
    const controlsUpdate = vi.fn()
    const camera = {
      position: { set: positionSet },
      fov: 19,
      updateProjectionMatrix,
    }
    const controls = {
      target: { set: targetSet },
      update: controlsUpdate,
    }

    expect(applyCameraPreset(camera, controls, preset)).toBe(true)
    expect(positionSet).toHaveBeenCalledWith(0, 0.18, 6.1)
    expect(camera.fov).toBe(42)
    expect(updateProjectionMatrix).toHaveBeenCalledOnce()
    expect(targetSet).toHaveBeenCalledWith(0, 0, 0)
    expect(controlsUpdate).toHaveBeenCalledOnce()
  })

  it('does nothing until both existing scene references are ready', () => {
    expect(applyCameraPreset(null, null, preset)).toBe(false)
  })

  it.each([
    { position: [Number.NaN, 0.18, 6.1] as const, fov: 42 },
    { position: [0, Number.POSITIVE_INFINITY, 6.1] as const, fov: 42 },
    { position: [0, 0.18, 6.1] as const, fov: Number.NaN },
    { position: [0, 0.18, 6.1] as const, fov: 0 },
    { position: [0, 0.18, 6.1] as const, fov: 180 },
  ])('rejects an invalid preset before mutating the existing scene', invalidPreset => {
    const positionSet = vi.fn()
    const updateProjectionMatrix = vi.fn()
    const targetSet = vi.fn()
    const controlsUpdate = vi.fn()
    const camera = {
      position: { set: positionSet },
      fov: 42,
      updateProjectionMatrix,
    }
    const controls = {
      target: { set: targetSet },
      update: controlsUpdate,
    }

    expect(applyCameraPreset(camera, controls, invalidPreset)).toBe(false)
    expect(positionSet).not.toHaveBeenCalled()
    expect(updateProjectionMatrix).not.toHaveBeenCalled()
    expect(targetSet).not.toHaveBeenCalled()
    expect(controlsUpdate).not.toHaveBeenCalled()
  })
})
