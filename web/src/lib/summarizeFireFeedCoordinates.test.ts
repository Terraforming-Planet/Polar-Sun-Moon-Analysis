import { describe, expect, it } from 'vitest'
import { summarizeFireFeed } from './summarizeFireFeed'

describe('summarizeFireFeed point coordinates', () => {
  it('ignores explicitly malformed or out-of-range fire point coordinates', () => {
    const firePoint = (coordinates?: unknown) => ({
      geometry: coordinates === undefined
        ? { type: 'Point' }
        : { type: 'Point', coordinates },
      properties: { categories: ['Fire'], source: 'NASA FIRMS' },
    })

    const summary = summarizeFireFeed({
      features: [
        firePoint([18.6466, 54.352]),
        firePoint([180, 90]),
        firePoint([86.925, 27.9881, 8848.86]),
        firePoint(),
        firePoint(null),
        firePoint([]),
        firePoint([18.6466]),
        firePoint(['18.6466', 54.352]),
        firePoint([Number.NaN, 54.352]),
        firePoint([181, 54.352]),
        firePoint([18.6466, -91]),
        firePoint([18.6466, 54.352, 'unknown-height']),
        firePoint([18.6466, 54.352, Number.NaN]),
        firePoint([18.6466, 54.352, Number.POSITIVE_INFINITY]),
      ],
    })

    expect(summary.pointCount).toBe(4)
    expect(summary.sourceLabels).toEqual(['NASA FIRMS'])
  })
})
