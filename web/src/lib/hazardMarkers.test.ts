import { describe, expect, it } from 'vitest'
import { prepareGpuHazardMarkers } from './hazardMarkers'

describe('prepareGpuHazardMarkers', () => {
  it('keeps valid categories represented when fires dominate the feed', () => {
    const fires = Array.from({ length: 1_000 }, (_, index) => ({
      id: `fire-${index}`,
      category: 'fire',
      latitude: 10,
      longitude: index % 180,
    }))
    const floods = [{ id: 'flood-1', category: 'flood', latitude: 51, longitude: 18 }]
    const earthquakes = [{ id: 'quake-1', category: 'earthquake', latitude: 35, longitude: 140 }]

    const selected = prepareGpuHazardMarkers([...fires, ...floods, ...earthquakes], 100)

    expect(selected).toHaveLength(100)
    expect(selected.some(marker => marker.category === 'flood')).toBe(true)
    expect(selected.some(marker => marker.category === 'earthquake')).toBe(true)
  })

  it('rejects invalid coordinates', () => {
    const selected = prepareGpuHazardMarkers([
      { category: 'fire', latitude: 91, longitude: 0 },
      { category: 'flood', latitude: 0, longitude: 181 },
      { category: 'storm', latitude: 0, longitude: 0 },
    ])

    expect(selected).toEqual([
      { category: 'storm', latitude: 0, longitude: 0 },
    ])
  })
})
