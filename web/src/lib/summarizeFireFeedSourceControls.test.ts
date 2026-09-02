import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed source label controls', () => {
  it('removes control and bidirectional formatting characters before display', () => {
    const summary = summarizeFireFeed({
      features: [
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Fire'], source: 'NASA\u0000 FIRMS' },
        },
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Wildfire'], source: 'NASA\u202e FIRMS' },
        },
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Fires'], source: '\u2066NASA FIRMS\u2069' },
        },
      ],
    })

    expect(summary.pointCount).toBe(3)
    expect(summary.sourceLabels).toEqual(['NASA FIRMS'])
    expect(summary.sourceLabels?.join('')).not.toMatch(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/)
  })
})
