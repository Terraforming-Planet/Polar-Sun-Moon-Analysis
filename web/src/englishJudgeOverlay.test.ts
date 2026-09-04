import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const overlayPath = fileURLToPath(new URL('../public/english-judge-overlay.js', import.meta.url))
const postbuildPath = fileURLToPath(new URL('../scripts/postbuild-contest-runtime.mjs', import.meta.url))
const overlay = readFileSync(overlayPath, 'utf8')
const postbuild = readFileSync(postbuildPath, 'utf8')

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
