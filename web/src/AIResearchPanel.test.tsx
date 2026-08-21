import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AIResearchPanel } from './AIResearchPanel'

describe('AIResearchPanel', () => {
  it('renders the advanced research workspace with the new privacy-first Simple entry flow', () => {
    const html = renderToStaticMarkup(<AIResearchPanel />)

    expect(html).toContain('Research any place on Earth')
    expect(html).toContain('Research area')
    expect(html).toContain('Research archive')
    expect(html).toContain('Approved AI tests')
    expect(html).toContain('Prosty')
    expect(html).toContain('Zaawansowany')
    expect(html).toContain('obrazy HQ · pliki · modele · flagi · DEM · profile · raporty')
    expect(html).toContain('Wpisz miejsce. Resztę przygotuje system.')
    expect(html).toContain('Zapytaj asystenta')
    expect(html).toContain('PYTANIE PRYWATNE · TYLKO SESJA')
    expect(html).toContain('treść pytania nie trafia do archiwum ani localStorage')
    expect(html).toContain('Wyślij prywatnie')
    expect(html).toContain('1990–dziś')
    expect(html).toContain('ZIEMIA 3D · KAFELKOWA MAPA REFERENCYJNA')
    expect(html).toContain('high-resolution basemap')
    expect(html).not.toContain('YOU / RESEARCHER')
    expect(html).not.toContain('Research account · Sign in with ChatGPT')
    expect(html).not.toContain('Continue with ChatGPT — not configured')
    expect(html).not.toContain('OPENAI_API_KEY')
  })

  it('renders a locked simple-only experience with compact references and no archive/approved-test tabs', () => {
    const html = renderToStaticMarkup(<AIResearchPanel simpleOnly />)

    expect(html).toContain('SIMPLE VIEW')
    expect(html).toContain('Research any place on Earth')
    expect(html).toContain('Tests 1–16')
    expect(html).toContain('Training 1')
    expect(html).toContain('Training 2')
    expect(html).toContain('Training 3')
    expect(html).toContain('Wpisz miejsce. Resztę przygotuje system.')
    expect(html).toContain('Zapytaj asystenta')
    expect(html).not.toContain('Approved AI tests')
    expect(html).not.toContain('Research archive')
    expect(html).not.toContain('Technical research settings')
  })
})
