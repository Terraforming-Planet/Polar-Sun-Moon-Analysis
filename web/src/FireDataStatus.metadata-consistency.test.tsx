import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  FireDataStatus,
  fireFeedSummary,
  resolveFireMetadataConsistency,
} from './FireDataStatus'

describe('fire catalog timestamp consistency', () => {
  it('accepts observations at or before catalog publication', () => {
    expect(resolveFireMetadataConsistency(
      Date.parse('2026-08-02T10:00:00Z'),
      Date.parse('2026-08-02T09:59:00Z'),
    )).toBe('consistent')

    expect(resolveFireMetadataConsistency(
      Date.parse('2026-08-02T10:00:00Z'),
      Date.parse('2026-08-02T10:00:00Z'),
    )).toBe('consistent')
  })

  it('flags an observation timestamp later than catalog publication', () => {
    const features = [{
      geometry: { type: 'Point' },
      properties: {
        categories: ['Wildfire'],
        observation_time: '2026-08-02T10:05:00Z',
      },
    }]
    const summary = fireFeedSummary(
      features,
      '2026-08-02T10:00:00Z',
      Date.parse('2026-08-02T11:00:00Z'),
    )

    expect(summary.metadataConsistency).toBe('observation-after-publication')

    const html = renderToStaticMarkup(
      <FireDataStatus
        features={features}
        generatedAtUtc="2026-08-02T10:00:00Z"
        nowMs={Date.parse('2026-08-02T11:00:00Z')}
      />,
    )

    expect(html).toContain('Spójność czasów')
    expect(html).toContain('niespójne metadane — obserwacja jest późniejsza niż publikacja katalogu')
  })

  it('reports unknown consistency when either timestamp is unavailable', () => {
    expect(resolveFireMetadataConsistency(Number.NaN, Date.parse('2026-08-02T10:00:00Z')))
      .toBe('unknown')
    expect(resolveFireMetadataConsistency(Date.parse('2026-08-02T10:00:00Z'), Number.NaN))
      .toBe('unknown')

    const html = renderToStaticMarkup(<FireDataStatus features={[]} />)
    expect(html).toContain('nie można porównać czasów publikacji i obserwacji')
  })
})
