import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatHydrologyUtc, HydrologyPanel } from './HydrologyPanel'

describe('HydrologyPanel navigation and evidence', () => {
  it('keeps project links and exposes official drought sources', () => {
    const html = renderToStaticMarkup(<HydrologyPanel baseUrl="/Polar-Sun-Moon-Analysis/" />)

    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/flood-map/"')
    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/copernicus/"')
    expect(html).toContain('drought.emergency.copernicus.eu')
    expect(html).toContain('Otwórz mapę powodzi Sentinel-1')
    expect(html).toContain('Copernicus Drought Observatories')
  })

  it('renders the 3D hydrology context and dated drought overview', () => {
    const html = renderToStaticMarkup(<HydrologyPanel baseUrl="/Polar-Sun-Moon-Analysis/" />)

    expect(html).toContain('Hydrologiczny kontekst 3D')
    expect(html).toContain('Zagrożone obszary')
    expect(html).toContain('Europa środkowa i południowa')
    expect(html).toContain('koniec czerwca 2026')
    expect(html).toContain('połowa lipca 2026')
    expect(html).toContain('nie zamieniamy opisowych regionów na zmyślone punkty')
  })
})

describe('formatHydrologyUtc', () => {
  it('does not throw when a published manifest contains an invalid timestamp', () => {
    expect(formatHydrologyUtc('not-a-date')).toBe('nieprawidłowy znacznik czasu')
    expect(formatHydrologyUtc('')).toBe('brak danych')
  })

  it('formats a valid UTC timestamp', () => {
    expect(formatHydrologyUtc('2026-08-12T08:00:00Z')).toContain('UTC')
  })
})
