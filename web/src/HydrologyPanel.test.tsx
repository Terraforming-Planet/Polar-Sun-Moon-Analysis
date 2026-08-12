import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HydrologyPanel } from './HydrologyPanel'

describe('HydrologyPanel navigation', () => {
  it('keeps direct project-relative links to flood and Copernicus views', () => {
    const html = renderToStaticMarkup(<HydrologyPanel baseUrl="/Polar-Sun-Moon-Analysis/" />)

    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/flood-map/"')
    expect(html).toContain('href="/Polar-Sun-Moon-Analysis/copernicus/"')
    expect(html).toContain('Otwórz mapę powodzi Sentinel-1')
    expect(html).toContain('Otwórz panel Copernicus')
  })
})
