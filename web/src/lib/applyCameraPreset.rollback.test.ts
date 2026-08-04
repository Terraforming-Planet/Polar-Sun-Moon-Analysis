import { describe, expect, it, vi } from 'vitest'
import { applyCameraPreset } from './applyCameraPreset'

describe('applyCameraPreset rollback', () => {
  it('restores the existing camera and target when a scene update throws', () => {
    const position = {
      x: 4,
      y: -1,
      z: 3,
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      },
    }
    const target = {
      x: 0.5,
      y: 0.25,
      z: -0.75,
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      },
    }
    const camera = {
      position,
      fov: 70,
      updateProjectionMatrix: vi.fn(),
    }
    const controls = {
      target,
      update: vi.fn(() => {
        throw new Error('disposed controls')
      }),
    }

    expect(applyCameraPreset(camera, controls, {
      position: [0, 0.18, 6.1],
      fov: 42,
    })).toBe(false)

    expect([position.x, position.y, position.z]).toEqual([4, -1, 3])
    expect([target.x, target.y, target.z]).toEqual([0.5, 0.25, -0.75])
    expect(camera.fov).toBe(70)
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(2)
    expect(controls.update).toHaveBeenCalledTimes(2)
  })
})
