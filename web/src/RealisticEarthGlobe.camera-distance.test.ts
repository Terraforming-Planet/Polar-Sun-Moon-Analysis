import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./RealisticEarthGlobe.tsx', import.meta.url), 'utf8')

function readPresetPositions(): Array<{ name: string; position: [number, number, number] }> {
  const block = source.match(/const viewSettings:[\s\S]*?= \{([\s\S]*?)\n\}/)?.[1] ?? ''
  return [...block.matchAll(/\s*(\w+):\s*\{\s*position:\s*\[([^\]]+)\]/g)].map(match => ({
    name: match[1],
    position: match[2].split(',').map(value => Number(value.trim())) as [number, number, number],
  }))
}

describe('RealisticEarthGlobe camera preset safety', () => {
  it('keeps every declared preset outside the globe and OrbitControls minimum distance', () => {
    const presets = readPresetPositions()
    const minimumDistance = Number(source.match(/controls\.minDistance\s*=\s*([\d.]+)/)?.[1])

    expect(presets.length).toBeGreaterThan(0)
    expect(Number.isFinite(minimumDistance)).toBe(true)

    for (const preset of presets) {
      const distance = Math.hypot(...preset.position)
      expect(Number.isFinite(distance), `${preset.name} should use finite coordinates`).toBe(true)
      expect(
        distance,
        `${preset.name} should remain outside controls.minDistance to avoid an inside-globe or clipped reset`,
      ).toBeGreaterThan(minimumDistance)
    }
  })
})
