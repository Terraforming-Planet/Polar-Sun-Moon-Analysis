import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const publicFile = path => new URL(`./public/${path}`, import.meta.url)
const text = path => readFile(publicFile(path), 'utf8')

const POLISH_UI = [
  'lang="pl"',
  'Galeria zdjęć',
  'Odtwarzaj',
  'Pauza',
  'Klatka',
  'Obserwacja UTC',
  'Przechwycono UTC',
  'Źródło',
  'Ładowanie manifestu',
  'Nie udało się wczytać manifestu',
  'Oryginalny plik NOAA',
  'Przekierowanie do aplikacji',
]

describe('standalone public pages use English UI by default', () => {
  it('keeps the eclipse archive gallery in English without changing provenance hooks', async () => {
    const html = await text('eclipse-live/gallery.html')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('Eclipse image gallery and animation')
    expect(html).toContain('Every frame below is a saved NOAA satellite observation')
    expect(html).toContain("const manifestUrl='../eclipse/2026-08-12/goes19-band02/manifest.json'")
    expect(html).toContain("a.textContent='original NOAA source ↗'")
    expect(html).toContain("a.textContent='Original NOAA file ↗'")
    expect(html).toContain("toLocaleString('en-US')")
    for (const phrase of POLISH_UI) expect(html).not.toContain(phrase)
  })

  it('keeps the public 404 redirect destination unchanged while using English copy', async () => {
    const html = await text('404.html')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('Redirecting to the Terraforming Planet application…')
    expect(html).toContain("window.location.replace('/Polar-Sun-Moon-Analysis/')")
    expect(html).toContain('content="0; url=/Polar-Sun-Moon-Analysis/"')
    for (const phrase of POLISH_UI) expect(html).not.toContain(phrase)
  })
})
