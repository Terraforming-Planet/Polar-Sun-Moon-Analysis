import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ResearchAreaBuilder } from './ResearchAreaBuilder'

describe('ResearchAreaBuilder', () => {
  it('renders a real hydrology map instead of the legacy world-picker placeholder', () => {
    const html = renderToStaticMarkup(<ResearchAreaBuilder onOpenArchive={() => undefined} />)

    expect(html).toContain('MAPA HYDROLOGICZNA · RZEKI + WODY')
    expect(html).toContain('ZSYNCHRONIZOWANA Z „ZBADAJ TEREN”')
    expect(html).toContain('river-helper-map/index.html?')
    expect(html).toContain('mode=hydrology')
    expect(html).toContain('editable=1')
    expect(html).toContain('radius=25')
    expect(html).toContain('shape=circle')
    expect(html).toContain('research-hydrology-map')
    expect(html).not.toContain('research-world-picker')
    expect(html).not.toContain('research-world-grid')
  })
})
