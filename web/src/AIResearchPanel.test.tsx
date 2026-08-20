import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AIResearchPanel } from './AIResearchPanel'

describe('AIResearchPanel', () => {
  it('renders an organized global research workspace with area and archive modes', () => {
    const html = renderToStaticMarkup(<AIResearchPanel />)

    expect(html).toContain('AI Research Workspace')
    expect(html).toContain('Nowe badanie')
    expect(html).toContain('Archiwum')
    expect(html).toContain('TEST 001–016')
    expect(html).toContain('OpenAI Explainer')
    expect(html).toContain('Wybierz obszar i przygotuj badanie')
    expect(html).toContain('Trzy opublikowane treningi AI')
    expect(html).toContain('TRAINING ≠ GROUND TRUTH')
    expect(html).toContain('official-public-only')
    expect(html).not.toContain('Woda i susza — 3D')
    expect(html).not.toContain('OPENAI_API_KEY')
  })
})
