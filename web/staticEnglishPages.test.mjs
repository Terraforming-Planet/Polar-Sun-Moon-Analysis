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

const MULTI_ANGLE_POLISH = [
  'Obserwacja wielokątowa',
  'Adres lub nazwa miejsca',
  'Znajdź adres',
  'Pokaż ręczne współrzędne',
  'Szerokość geograficzna',
  'Długość geograficzna',
  'Promień obszaru',
  'Maks. zachmurzenie',
  'Znajdź obserwacje',
  'brak danych',
  'Wyszukiwanie adresu',
  'Nie znaleziono adresu',
  'Brak produktów',
  'Znaleziono',
  'Kąt obserwacji',
  'Wyniki pobrano',
  'Błąd:',
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

  it('keeps the multi-angle search form and dynamic result messages in English', async () => {
    const [html, runtime] = await Promise.all([text('multi-angle/index.html'), text('multi-angle/app.js')])
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('Multi-angle Earth observation')
    expect(html).toContain('Find observations')
    expect(runtime).toContain("const endpoint='https://stac.dataspace.copernicus.eu/v1/search'")
    expect(runtime).toContain('Results loaded from the official Copernicus catalog.')
    expect(runtime).toContain('Observation angle')
    for (const phrase of MULTI_ANGLE_POLISH) {
      expect(html).not.toContain(phrase)
      expect(runtime).not.toContain(phrase)
    }
  })
})
