import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed source label order', () => {
  it('sorts normalized source labels independently of feature order', () => {
    const sources = ['Copernicus EMS', 'NASA FIRMS', 'NOAA Hazard Mapping System']
    const feature = (source: string) => ({
      geometry: { type: 'Point' },
      properties: { categories: ['Fire'], source },
    })

    const forward = summarizeFireFeed({ features: sources.map(feature) })
    const reversed = summarizeFireFeed({ features: [...sources].reverse().map(feature) })

    expect(forward.pointCount).toBe(3)
    expect(reversed.pointCount).toBe(3)
    expect(forward.sourceLabels).toEqual([
      'Copernicus EMS',
      'NASA FIRMS',
      'NOAA Hazard Mapping System',
    ])
    expect(reversed.sourceLabels).toEqual(forward.sourceLabels)
  })
})
