import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SatelliteSourceStatusPanel } from './SatelliteSourceStatusPanel'
import { SATELLITE_SOURCES } from './lib/satelliteSources'

describe('SatelliteSourceStatusPanel', () => {
  it('shows source metadata and the honest fallback state', () => {
    const source = SATELLITE_SOURCES[1]
    const html = renderToStaticMarkup(
      <SatelliteSourceStatusPanel
        source={source}
        logicalZoom={12}
        modeLabel="AUTO"
        nowMs={Date.parse('2026-08-01T12:00:00Z')}
        observation={{
          observedAtUtc: '2026-08-01T06:00:00Z',
          cloudCoverPercent: 18,
          hasCoverage: true,
          tilesConnected: false,
        }}
      />,
    )

    expect(html).toContain('Sentinel-2 L2A')
    expect(html).toContain('6.0 h')
    expect(html).toContain('about 10 m/pixel')
    expect(html).toContain('18%')
    expect(html).toContain('coverage confirmed')
    expect(html).toContain('2K base texture')
    expect(html).toContain('Active satellite source status')
  })
})
