import { describe, expect, it } from 'vitest'
import { cameraPresetDistance, cameraPresetFor } from './cameraPresets'

describe('Earth camera presets', () => {
  it('keeps the Moon preset visibly farther away than the full-disc preset', () => {
    expect(cameraPresetDistance('moon')).toBeGreaterThan(cameraPresetDistance('full') * 1.8)
    expect(cameraPresetFor('moon').fov).toBeLessThan(cameraPresetFor('full').fov)
  })

  it('uses opposite camera positions for Greenwich and the date line', () => {
    const greenwich = cameraPresetFor('greenwich').position
    const dateline = cameraPresetFor('dateline').position

    expect(Math.sign(greenwich[0])).toBe(1)
    expect(Math.sign(dateline[0])).toBe(-1)
    expect(greenwich[2]).toBe(0)
    expect(dateline[2]).toBe(0)
  })

  it('uses opposite poles without changing the camera target', () => {
    const north = cameraPresetFor('north')
    const south = cameraPresetFor('south')

    expect(Math.sign(north.position[1])).toBe(1)
    expect(Math.sign(south.position[1])).toBe(-1)
    expect(north.target).toEqual([0, 0, 0])
    expect(south.target).toEqual([0, 0, 0])
  })
})
