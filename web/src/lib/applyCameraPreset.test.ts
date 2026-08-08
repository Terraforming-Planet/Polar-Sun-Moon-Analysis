import { describe, expect, it, vi } from 'vitest'
import { applyCameraPreset } from './applyCameraPreset'

type CameraInput = Parameters<typeof applyCameraPreset>[0]
type ControlsInput = Parameters<typeof applyCameraPreset>[1]

describe('applyCameraPreset', () => {
  it('reapplies the same preset on every reset without rebuilding the scene', () => {
    const positionSet = vi.fn()
    const targetSet = vi.fn()
    const updateProjectionMatrix = vi.fn()
    const controlsUpdate = vi.fn()
    const camera = {
      position: { set: positionSet },
      fov: 70,
      updateProjectionMatrix,
    }
    const controls = {
      target: { set: targetSet },
      update: controlsUpdate,
    }
    const preset = { position: [0, 0.18, 6.1] as const, fov: 42 }

    expect(applyCameraPreset(camera, controls, preset)).toBe(true)
    expect(applyCameraPreset(camera, controls, preset)).toBe(true)

    expect(positionSet).toHaveBeenCalledTimes(2)
    expect(positionSet).toHaveBeenLastCalledWith(0, 0.18, 6.1)
    expect(camera.fov).toBe(42)
    expect(updateProjectionMatrix).toHaveBeenCalledTimes(2)
    expect(targetSet).toHaveBeenCalledTimes(2)
    expect(targetSet).toHaveBeenLastCalledWith(0, 0, 0)
    expect(controlsUpdate).toHaveBeenCalledTimes(2)
  })

  it('restores the active preset after the user manually moves and zooms the existing camera', () => {
    const position = {
      x: 0,
      y: 0.18,
      z: 6.1,
      set: vi.fn((x: number, y: number, z: number) => {
        position.x = x
        position.y = y
        position.z = z
      }),
    }
    const target = {
      x: 0,
      y: 0,
      z: 0,
      set: vi.fn((x: number, y: number, z: number) => {
        target.x = x
        target.y = y
        target.z = z
      }),
    }
    const camera = {
      position,
      fov: 42,
      updateProjectionMatrix: vi.fn(),
    }
    const controls = {
      target,
      update: vi.fn(),
    }
    const preset = { position: [0, 0.18, 6.1] as const, fov: 42 }

    position.set(4.5, -1.2, 2.7)
    target.set(0.9, 0.4, -0.3)
    camera.fov = 75

    expect(applyCameraPreset(camera, controls, preset)).toBe(true)

    expect([position.x, position.y, position.z]).toEqual([0, 0.18, 6.1])
    expect([target.x, target.y, target.z]).toEqual([0, 0, 0])
    expect(camera.fov).toBe(42)
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1)
    expect(controls.update).toHaveBeenCalledTimes(1)
  })

  it.each([
    { camera: null, controls: null },
    {
      camera: { position: { set: vi.fn() }, fov: 55, updateProjectionMatrix: vi.fn() },
      controls: null,
    },
    {
      camera: null,
      controls: { target: { set: vi.fn() }, update: vi.fn() },
    },
    {
      camera: { position: {} } as unknown as CameraInput,
      controls: { target: { set: vi.fn() }, update: vi.fn() },
    },
    {
      camera: { position: { set: vi.fn() }, fov: 55, updateProjectionMatrix: vi.fn() },
      controls: { target: {} } as unknown as ControlsInput,
    },
  ] satisfies Array<{ camera: CameraInput; controls: ControlsInput }>)('returns false for incomplete scene references without throwing', ({ camera, controls }) => {
    const preset = { position: [0, 0.18, 6.1] as const, fov: 42 }

    expect(() => applyCameraPreset(camera, controls, preset)).not.toThrow()
    expect(applyCameraPreset(camera, controls, preset)).toBe(false)
  })

  it('rejects invalid runtime references before mutating camera state', () => {
    const camera = {
      position: { set: 'not-a-function' },
      fov: 75,
      updateProjectionMatrix: vi.fn(),
    } as unknown as CameraInput
    const controls = {
      target: { set: vi.fn() },
      update: vi.fn(),
    }
    const preset = { position: [0, 0.18, 6.1] as const, fov: 42 }

    expect(applyCameraPreset(camera, controls, preset)).toBe(false)
    expect(camera?.fov).toBe(75)
    expect(camera?.updateProjectionMatrix).not.toHaveBeenCalled()
    expect(controls.target.set).not.toHaveBeenCalled()
    expect(controls.update).not.toHaveBeenCalled()
  })

  it.each([
    null,
    undefined,
    { position: [0, 1] as unknown as readonly [number, number, number], fov: 42 },
    { position: [0, Number.NaN, 6] as const, fov: 42 },
    { position: [0, 0, 0] as const, fov: 42 },
    { position: [0, 0, 6] as const, fov: 0 },
    { position: [0, 0, 6] as const, fov: 180 },
  ])('rejects malformed preset %j without mutating scene references', preset => {
    const camera = {
      position: { set: vi.fn() },
      fov: 55,
      updateProjectionMatrix: vi.fn(),
    }
    const controls = {
      target: { set: vi.fn() },
      update: vi.fn(),
    }

    expect(applyCameraPreset(camera, controls, preset)).toBe(false)
    expect(camera.position.set).not.toHaveBeenCalled()
    expect(camera.fov).toBe(55)
    expect(camera.updateProjectionMatrix).not.toHaveBeenCalled()
    expect(controls.target.set).not.toHaveBeenCalled()
    expect(controls.update).not.toHaveBeenCalled()
  })
})
