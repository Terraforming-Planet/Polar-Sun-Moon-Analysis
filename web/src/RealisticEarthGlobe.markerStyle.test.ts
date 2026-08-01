import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./RealisticEarthGlobe.tsx', import.meta.url), 'utf8')

describe('RealisticEarthGlobe hazard marker styling', () => {
  it('forces visible red markers instead of accepting black input colors', () => {
    expect(source).toContain('color: 0xff2d2d')
    expect(source).toContain('toneMapped: false')
    expect(source).not.toContain('color: marker.color ??')
  })

  it('keeps marker spheres compact on the globe', () => {
    expect(source).toContain('Math.max(0.008, Math.min(0.016, (marker.radius ?? 1) * 0.012))')
    expect(source).toContain('EARTH_RADIUS * 1.018')
  })
})
