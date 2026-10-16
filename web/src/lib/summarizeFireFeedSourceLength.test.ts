import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed source label length', () => {
  it('bounds untrusted source labels without splitting Unicode code points', () => {
    const longSource = `${'A'.repeat(159)}🔥TAIL`
    const summary = summarizeFireFeed({
      features: [
        {
          geometry: { type: 'Point' },
          properties: { categories: ['Fire'], source: longSource },
        },
      ],
    })

    expect(summary.pointCount).toBe(1)
    expect(summary.sourceLabels).toHaveLength(1)
    expect([...summary.sourceLabels![0]]).toHaveLength(160)
    expect(summary.sourceLabels![0]).toBe(`${'A'.repeat(159)}🔥`)
    expect(summary.sourceLabels![0]).not.toContain('TAIL')
  })
})
