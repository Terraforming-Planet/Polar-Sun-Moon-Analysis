import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AIResearchPanel } from './AIResearchPanel'

describe('AIResearchPanel', () => {
  it('renders a simple public console while keeping advanced tools and raw-chat privacy explicit', () => {
    const html = renderToStaticMarkup(<AIResearchPanel />)

    expect(html).toContain('Zbadaj dowolne miejsce na Ziemi')
    expect(html).toContain('Zbadaj teren')
    expect(html).toContain('Archiwum badań')
    expect(html).toContain('Zatwierdzone testy AI')
    expect(html).toContain('Tryb prosty')
    expect(html).toContain('Zaawansowane')
    expect(html).toContain('Znajdź teren i od razu go zbadaj')
    expect(html).toContain('Asystent badawczy')
    expect(html).toContain('treść rozmowy jest tylko w pamięci tej karty')
    expect(html).toContain('Wybierz obszar i przygotuj badanie')
    expect(html).toContain('OFFICIAL / PUBLIC DATA ONLY')
    expect(html).not.toContain('AI Research Workspace')
    expect(html).not.toContain('Woda i susza — 3D')
    expect(html).not.toContain('OPENAI_API_KEY')
  })
})
