import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed source attribution', () => {
  it('derives unique source labels only from counted fire points', () => {
    const summary = summarizeFireFeed({
      features: [
        { geometry: { type: 'Point' }, properties: { categories: ['Wildfires'], source: ' NASA EONET ' } },
        { geometry: { type: 'Point' }, properties: { categories: ['Fire'], source: 'nasa eonet' } },
        { geometry: { type: 'Point' }, properties: { categories: ['Fires'], source: 'NASA FIRMS / VIIRS' } },
        { geometry: { type: 'Polygon' }, properties: { categories: ['Wildfires'], source: 'Polygon catalogue' } },
        { geometry: { type: 'Point' }, properties: { categories: ['Floods'], source: 'Sentinel-1' } },
        { geometry: { type: 'Point' }, properties: { categories: ['Fire'], source: '   ' } },
      ],
    })

    expect(summary.pointCount).toBe(4)
    expect(summary.sourceLabels).toEqual(['NASA EONET', 'NASA FIRMS / VIIRS'])
  })

  it('does not invent a source label when counted points have no documented source', () => {
    const summary = summarizeFireFeed({
      features: [
        { geometry: { type: 'Point' }, properties: { categories: ['Fire'] } },
      ],
    })

    expect(summary.pointCount).toBe(1)
    expect(summary.sourceLabels).toBeUndefined()
  })
})
