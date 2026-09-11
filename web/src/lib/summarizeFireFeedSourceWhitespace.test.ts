import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed source labels', () => {
  it('collapses whitespace and deduplicates equivalent fire source names', () => {
    const summary = summarizeFireFeed({
      features: [
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Fire'], source: ' NASA   FIRMS ' },
        },
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Wildfire'], source: 'nasa\nfirms' },
        },
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Fires'], source: '\tNASA FIRMS\t' },
        },
      ],
    })

    expect(summary.pointCount).toBe(3)
    expect(summary.sourceLabels).toEqual(['NASA FIRMS'])
  })
})
