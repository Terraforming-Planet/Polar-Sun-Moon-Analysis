import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AIResearchPanel } from './AIResearchPanel'

describe('AIResearchPanel', () => {
  it('renders the simple map-first research flow and keeps advanced tools available', () => {
    const html = renderToStaticMarkup(<AIResearchPanel />)

    expect(html).toContain('Zbadaj dowolne miejsce na Ziemi')
    expect(html).toContain('Zbadaj teren')
    expect(html).toContain('Archiwum')
    expect(html).toContain('TEST 001–016')
    expect(html).toContain('Zatwierdzone testy AI')
    expect(html).toContain('Wpisz miejsce. Resztę zrobi AI.')
    expect(html).toContain('Zaawansowane')
    expect(html).toContain('Wybierz obszar i przygotuj badanie')
    expect(html).toContain('OFFICIAL / PUBLIC DATA ONLY')
    expect(html).not.toContain('AI Research Workspace')
    expect(html).not.toContain('Woda i susza — 3D')
    expect(html).not.toContain('OPENAI_API_KEY')
  })
})
