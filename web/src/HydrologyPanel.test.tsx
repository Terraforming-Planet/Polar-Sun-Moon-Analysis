import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatHydrologyUtc, HydrologyPanel } from './HydrologyPanel'

describe('HydrologyPanel navigation and evidence', () => {
  it('keeps project links and exposes official drought sources', () => {
    const html = renderToStaticMarkup(<HydrologyPanel baseUrl="/Polar-Sun-Moon-Analysis/" />)

    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/water-local/"')
    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/flood-map/"')
    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/copernicus/"')
    expect(html).toContain('drought.emergency.copernicus.eu')
    expect(html).toContain('Olszówka multi-sensor validation')
    expect(html).toContain('Open Sentinel-1 flood map')
    expect(html).toContain('Copernicus Drought Observatories')
  })

  it('renders the 3D hydrology context and dated drought overview without embedding the global AI workspace', () => {
    const html = renderToStaticMarkup(<HydrologyPanel baseUrl="/Polar-Sun-Moon-Analysis/" />)

    expect(html).toContain('3D hydrological context')
    expect(html).toContain('Drought-affected regions — latest official overview')
    expect(html).toContain('Central and Southern Europe')
    expect(html).toContain('late June 2026')
    expect(html).toContain('mid-July 2026')
    expect(html).toContain('descriptive regions are not converted into invented point markers')
    expect(html).toContain('Olszówka / Gardeja local validation area')
    expect(html).toContain('Sentinel-1 and Sentinel-2')
    expect(html).toContain('NASA VIIRS night radiance')
    expect(html).not.toContain('AI Evidence / Research Explainer')
  })
})

describe('formatHydrologyUtc', () => {
  it('does not throw when a published manifest contains an invalid timestamp', () => {
    expect(formatHydrologyUtc('not-a-date')).toBe('invalid timestamp')
    expect(formatHydrologyUtc('')).toBe('no data')
  })

  it('formats a valid UTC timestamp', () => {
    expect(formatHydrologyUtc('2026-08-12T08:00:00Z')).toContain('UTC')
  })
})
