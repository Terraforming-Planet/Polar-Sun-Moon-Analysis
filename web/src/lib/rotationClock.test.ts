import { describe, expect, it } from 'vitest'
import { createRotationClock } from './rotationClock'

describe('createRotationClock', () => {
  it('pauses and resumes without resetting the current Earth angle', () => {
    const clock = createRotationClock(1, 0.5, true)

    expect(clock.advance(2)).toBe(2)
    clock.setEnabled(false)
    expect(clock.advance(20)).toBe(2)
    expect(clock.angle()).toBe(2)

    clock.setEnabled(true)
    expect(clock.advance(2)).toBe(3)
  })

  it('ignores invalid or negative frame durations', () => {
    const clock = createRotationClock(0.75, 1, true)

    expect(clock.advance(Number.NaN)).toBe(0.75)
    expect(clock.advance(-1)).toBe(0.75)
  })
})
