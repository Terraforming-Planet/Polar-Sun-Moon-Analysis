import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed duplicate source casing', () => {
  it('chooses the same normalized label when case-only duplicates change order', () => {
    const feature = (source: string) => ({
      geometry: { type: 'Point' },
      properties: { categories: ['Fire'], source },
    })
    const sources = ['nasa firms', 'NASA   FIRMS', 'Nasa Firms']

    const forward = summarizeFireFeed({ features: sources.map(feature) })
    const reversed = summarizeFireFeed({ features: [...sources].reverse().map(feature) })

    expect(forward.pointCount).toBe(3)
    expect(reversed.pointCount).toBe(3)
    expect(forward.sourceLabels).toEqual(['NASA FIRMS'])
    expect(reversed.sourceLabels).toEqual(forward.sourceLabels)
  })
})
