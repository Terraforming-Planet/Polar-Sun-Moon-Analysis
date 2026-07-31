import { describe, expect, it } from 'vitest'
import panelSource from './EarthSourcePanel.tsx?raw'
import globeSource from './RealisticEarthGlobe.tsx?raw'
import cssSource from './stable-earth-globe.css?raw'

describe('Earth source provenance panel', () => {
  it('is rendered by the main Earth viewer', () => {
    expect(globeSource).toContain("import { EarthSourcePanel } from './EarthSourcePanel'")
    expect(globeSource).toContain('<EarthSourcePanel />')
  })

  it('explains that a mosaic is not one simultaneous raw photograph', () => {
    expect(panelSource).toContain('Mozaika nie jest opisywana jako pojedyncze surowe zdjęcie')
    expect(panelSource).toContain('Źródła modelu Ziemi')
    expect(panelSource).toContain('Licencja')
    expect(panelSource).toContain('Przetwarzanie')
  })

  it('has responsive and keyboard-visible styling', () => {
    expect(cssSource).toContain('.earth-source-panel summary:focus-visible')
    expect(cssSource).toContain('.earth-source-list{display:grid')
    expect(cssSource).toContain('@media(max-width:700px)')
    expect(cssSource).toContain('.earth-source-list{grid-template-columns:1fr}')
  })
})
