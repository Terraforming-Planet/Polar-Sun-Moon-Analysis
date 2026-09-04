import overlay from '../public/english-judge-overlay.js?raw'
import postbuild from '../scripts/postbuild-contest-runtime.mjs?raw'
import { describe, expect, it } from 'vitest'

describe('English judge UI delivery', () => {
  it('translates the primary Simple and Advanced research surfaces', () => {
    for (const expected of [
      "['Prosty', 'Simple']",
      "['Zaawansowany', 'Advanced']",
      "['Zbadaj teren', 'Research area']",
      "['Wyślij prywatnie', 'Send privately']",
      "['MAPA POMOCNICZA · PAŃSTWA + RZEKI', 'REFERENCE MAP · COUNTRIES + RIVERS']",
      "['ARCHIWUM OBRAZÓW · 1990–DZIŚ', 'IMAGE ARCHIVE · 1990–TODAY']",
      "['Stare moduły', 'Legacy modules']",
    ]) {
      expect(overlay).toContain(expected)
    }
  })

  it('keeps English active for React rerenders and delayed content', () => {
    expect(overlay).toContain("document.documentElement.lang = 'en'")
    expect(overlay).toContain('new MutationObserver')
    expect(overlay).toContain("attributeFilter: ATTRIBUTES")
  })

  it('injects the versioned overlay into every generated HTML page', () => {
    expect(postbuild).toContain('english-judge-overlay.js?v=20260904-en')
    expect(postbuild).toContain("ensureDeferredScript(updated, 'english-judge-overlay.js'")
  })
})
