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

  it('reapplies the same preset on every reset click without relying on a state transition', () => {
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

    expect(applyCameraPreset(camera, controls, preset)).toBe(true)
    expect(applyCameraPreset(camera, controls, preset)).toBe(true)
    expect(positionSet).toHaveBeenCalledTimes(2)
    expect(positionSet).toHaveBeenNthCalledWith(2, 0, 0.18, 6.1)
    expect(updateProjectionMatrix).toHaveBeenCalledTimes(2)
    expect(targetSet).toHaveBeenCalledTimes(2)
    expect(controlsUpdate).toHaveBeenCalledTimes(2)
  })

  it('does nothing until both existing scene references are ready', () => {
    expect(applyCameraPreset(null, null, preset)).toBe(false)
  })

  it.each([
    {
      camera: { position: {}, fov: 42, updateProjectionMatrix: vi.fn() },
      controls: { target: { set: vi.fn() }, update: vi.fn() },
    },
    {
      camera: { position: { set: vi.fn() }, fov: 42 },
      controls: { target: { set: vi.fn() }, update: vi.fn() },
    },
    {
      camera: { position: { set: vi.fn() }, fov: 42, updateProjectionMatrix: vi.fn() },
      controls: { target: {}, update: vi.fn() },
    },
    {
      camera: { position: { set: vi.fn() }, fov: 42, updateProjectionMatrix: vi.fn() },
      controls: { target: { set: vi.fn() } },
    },
  ])('rejects incomplete scene references instead of throwing', ({ camera, controls }) => {
    expect(() => applyCameraPreset(camera as never, controls as never, preset)).not.toThrow()
    expect(applyCameraPreset(camera as never, controls as never, preset)).toBe(false)
  })

  it('rolls back a partial reset when stale controls throw', () => {
    const camera = {
      position: { x: 9, y: 8, z: 7, set: vi.fn() },
      fov: 31,
      updateProjectionMatrix: vi.fn(),
    }
    const controls = {
      target: { x: 1, y: 2, z: 3, set: vi.fn() },
      update: vi.fn(() => { throw new Error('disposed controls') }),
    }

    expect(() => applyCameraPreset(camera, controls, preset)).not.toThrow()
    expect(applyCameraPreset(camera, controls, preset)).toBe(false)
    expect(camera.position.set).toHaveBeenLastCalledWith(9, 8, 7)
    expect(camera.fov).toBe(31)
    expect(controls.target.set).toHaveBeenLastCalledWith(1, 2, 3)
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(4)
  })

  it.each([
    null,
    undefined,
    { position: null, fov: 42 },
    { position: [0, 0.18], fov: 42 },
    { position: [0, 0.18, 6.1, 8], fov: 42 },
    { position: [Number.NaN, 0.18, 6.1], fov: 42 },
    { position: [0, Number.POSITIVE_INFINITY, 6.1], fov: 42 },
    { position: [0, 0.18, 6.1], fov: Number.NaN },
    { position: [0, 0.18, 6.1], fov: 0 },
    { position: [0, 0.18, 6.1], fov: 180 },
  ])('rejects a missing or malformed preset before mutating the existing scene', invalidPreset => {
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

    expect(applyCameraPreset(camera, controls, invalidPreset as never)).toBe(false)
    expect(positionSet).not.toHaveBeenCalled()
    expect(updateProjectionMatrix).not.toHaveBeenCalled()
    expect(targetSet).not.toHaveBeenCalled()
    expect(controlsUpdate).not.toHaveBeenCalled()
  })
})
