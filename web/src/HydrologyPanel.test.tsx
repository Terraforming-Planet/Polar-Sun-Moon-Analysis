import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatHydrologyUtc, HydrologyPanel } from './HydrologyPanel'

describe('HydrologyPanel navigation', () => {
  it('keeps direct project-relative links to flood and Copernicus views', () => {
    const html = renderToStaticMarkup(<HydrologyPanel baseUrl="/Polar-Sun-Moon-Analysis/" />)

    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/flood-map/"')
    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/copernicus/"')
    expect(html).toContain('Otwórz mapę powodzi Sentinel-1')
    expect(html).toContain('Otwórz panel Copernicus')
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
