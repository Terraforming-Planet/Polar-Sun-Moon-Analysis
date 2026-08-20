import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AIResearchPanel } from './AIResearchPanel'

describe('AIResearchPanel', () => {
  it('renders as a global research workspace rather than a hydrology-only control', () => {
    const html = renderToStaticMarkup(<AIResearchPanel />)

    expect(html).toContain('AI Research — wszystkie zarejestrowane testy')
    expect(html).toContain('centralny moduł AI dla całej platformy')
    expect(html).toContain('OpenAI nie może samodzielnie przeszukiwać prywatnych plików')
    expect(html).not.toContain('Woda i susza — 3D')
    expect(html).not.toContain('OPENAI_API_KEY')
  })
})
