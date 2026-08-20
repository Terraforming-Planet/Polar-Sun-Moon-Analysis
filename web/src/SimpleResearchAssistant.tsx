import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import './simple-research.css'
import {
  analyzeResearchArea,
  searchResearchPlace,
  type AreaAnalysisResponse,
  type GeocodeResult,
} from './lib/evidenceApi'
import { parseResearchLocation } from './researchLocation'
import { RealisticEarthGlobe } from './RealisticEarthGlobe'
import { ResearchChatNotebook } from './ResearchChatNotebook'
import { ResearchTerrainLab } from './ResearchTerrainLab'

type Place = {
  label: string
  latitude: number
  longitude: number
}

type PeriodPreset = 'long' | 'five-years' | 'one-year'
type ConsoleMode = 'simple' | 'advanced'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function yearStart(year: number) {
  return `${year}-01-01`
}

function periodForPreset(preset: PeriodPreset) {
  const endDate = today()
  const year = Number(endDate.slice(0, 4))
  if (preset === 'one-year') return { startDate: yearStart(year - 1), endDate }
  if (preset === 'five-years') return { startDate: yearStart(year - 5), endDate }
  return { startDate: '1990-01-01', endDate }
}

function boundsForMap(latitude: number, longitude: number, radiusKm = 25) {
  const latDelta = Math.max(0.08, radiusKm / 111.32)
  const lonScale = Math.max(0.2, Math.cos(latitude * Math.PI / 180))
  const lonDelta = Math.max(0.08, radiusKm / (111.32 * lonScale))
  return {
    west: Math.max(-180, longitude - lonDelta),
    south: Math.max(-90, latitude - latDelta),
    east: Math.min(180, longitude + lonDelta),
    north: Math.min(90, latitude + latDelta),
  }
}

function osmEmbedUrl(place: Place) {
  const bounds = boundsForMap(place.latitude, place.longitude, 25)
  const params = new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    layer: 'mapnik',
    marker: `${place.latitude},${place.longitude}`,
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function confidenceLabel(level: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'wysoka'
  if (level === 'medium') return 'średnia'
  return 'niska'
}

export function SimpleResearchAssistant({
  apiUrl,
  advanced,
}: {
  apiUrl: string
  advanced: ReactNode
}) {
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('simple')
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [alternatives, setAlternatives] = useState<GeocodeResult[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('long')
  const [status, setStatus] = useState<'idle' | 'searching' | 'analyzing' | 'ready' | 'error'>('idle')
  const [analysis, setAnalysis] = useState<AreaAnalysisResponse | null>(null)
  const [error, setError] = useState('')
  const analysisController = useRef<AbortController | null>(null)
  const period = useMemo(() => periodForPreset(periodPreset), [periodPreset])
  const previewUtc = useMemo(() => new Date().toISOString(), [])

  const runAnalysis = async (target: Place, depth: 'quick' | 'deep' = 'quick') => {
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    setStatus('analyzing')
    setError('')
    try {
      const result = await analyzeResearchArea(apiUrl, {
        latitude: target.latitude,
        longitude: target.longitude,
        radiusKm: 25,
        startDate: period.startDate,
        endDate: period.endDate,
        placeName: target.label,
        depth,
      }, controller.signal)
      setAnalysis(result)
      setStatus('ready')
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('error')
    }
  }

  const choosePlace = (target: Place, depth: 'quick' | 'deep' = 'quick') => {
    setPlace(target)
    setAnalysis(null)
    void runAnalysis(target, depth)
  }

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    const direct = parseResearchLocation(trimmed)
    if (direct) {
      setAlternatives([])
      choosePlace({
        label: `Wybrany punkt ${direct.latitude.toFixed(4)}, ${direct.longitude.toFixed(4)}`,
        latitude: direct.latitude,
        longitude: direct.longitude,
      })
      return
    }

    setStatus('searching')
    setError('')
    try {
      const result = await searchResearchPlace(apiUrl, trimmed)
      setAlternatives(result.results)
      const first = result.results[0]
      if (!first) {
        setStatus('error')
        setError('Nie znaleziono miejsca. Spróbuj wpisać nazwę miejscowości, jeziora, rzeki albo regionu.')
        return
      }
      choosePlace({ label: first.display_name, latitude: first.latitude, longitude: first.longitude })
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const rerunForPeriod = (preset: PeriodPreset) => {
    setPeriodPreset(preset)
    if (!place) return
    const selectedPeriod = periodForPreset(preset)
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    setStatus('analyzing')
    setError('')
    analyzeResearchArea(apiUrl, {
      latitude: place.latitude,
      longitude: place.longitude,
      radiusKm: 25,
      startDate: selectedPeriod.startDate,
      endDate: selectedPeriod.endDate,
      placeName: place.label,
      depth: 'quick',
    }, controller.signal).then(result => {
      setAnalysis(result)
      setStatus('ready')
    }).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('error')
    })
  }

  const globeMarkers = place ? [{
    longitude: place.longitude,
    latitude: place.latitude,
    color: 0x35cfff,
    radius: 1.35,
  }] : []

  return <section className="simple-research" aria-label="Badanie terenu z AI">
    <div className="simple-console-mode panel" role="group" aria-label="Poziom obsługi">
      <button type="button" className={consoleMode === 'simple' ? 'active' : ''} onClick={() => setConsoleMode('simple')}>
        <b>Tryb prosty</b><span>wyszukaj miejsce → zobacz Ziemię → zapytaj asystenta</span>
      </button>
      <button type="button" className={consoleMode === 'advanced' ? 'active' : ''} onClick={() => setConsoleMode('advanced')}>
        <b>Zaawansowane</b><span>obrazy HQ · pliki · modele · flagi · DEM · profile · raporty</span>
      </button>
    </div>

    <div className="simple-research-hero panel">
      <div className="simple-research-copy">
        <small>{consoleMode === 'simple' ? 'PROSTA KONSOLA · MAPA · SATELITY · ASYSTENT' : 'LABORATORIUM · SATELITY · DEM · OPENAI'}</small>
        <h2>{consoleMode === 'simple' ? 'Znajdź teren i od razu go zbadaj' : 'Zaawansowane badanie terenu'}</h2>
        <p>{consoleMode === 'simple'
          ? 'Wpisz jezioro, rzekę, miejscowość lub region. System zaznaczy miejsce na globusie, pobierze najnowsze dostępne dane i pokaże prosty wynik. Asystent jest obok mapy i prowadzi Cię dalej.'
          : 'Tu masz pełne narzędzia: wybór modeli GPT, załączniki, wysokiej jakości obrazy Copernicus/NASA, numerowane flagi, wysokości DEM, kolorowe linie, profile i raporty.'}</p>
      </div>
      <form className="simple-search" onSubmit={submitSearch}>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="np. Nil, Jezioro Tana, Wisła koło Gniewu, Sahara…"
          aria-label="Wyszukaj miejsce do zbadania"
        />
        <button type="submit" className="primary" disabled={!apiUrl || status === 'searching' || status === 'analyzing'}>
          {status === 'searching' ? 'Szukam…' : status === 'analyzing' ? 'AI bada teren…' : 'Zbadaj teren'}
        </button>
      </form>

      <div className="simple-periods" role="group" aria-label="Zakres czasu badania">
        <button type="button" className={periodPreset === 'long' ? 'active' : ''} onClick={() => rerunForPeriod('long')}>1990–dziś</button>
        <button type="button" className={periodPreset === 'five-years' ? 'active' : ''} onClick={() => rerunForPeriod('five-years')}>ostatnie 5 lat</button>
        <button type="button" className={periodPreset === 'one-year' ? 'active' : ''} onClick={() => rerunForPeriod('one-year')}>ostatni rok</button>
      </div>

      {alternatives.length > 1 && <details className="simple-search-alternatives">
        <summary>Inne znalezione miejsca</summary>
        <div>{alternatives.slice(1).map(item => <button type="button" key={`${item.latitude}-${item.longitude}`} onClick={() => choosePlace({ label: item.display_name, latitude: item.latitude, longitude: item.longitude })}>{item.display_name}</button>)}</div>
      </details>}
      {error && <p className="research-error" role="alert">{error}</p>}
    </div>

    <div className="simple-console-grid">
      <div className="simple-map panel simple-earth-preview">
        <div className="simple-map-head">
          <div><small>ZIEMIA 3D · NAJNOWSZA DOSTĘPNA OBSERWACJA</small><h3>{place ? place.label : 'Obróć globus lub wyszukaj miejsce'}</h3></div>
          <span>{place ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : 'Cesium · WGS84 · NASA / Copernicus'}</span>
        </div>
        <RealisticEarthGlobe selectedTime={previewUtc} markers={globeMarkers} />
        <p className="simple-map-source">To nie jest sztuczna tekstura. Globus korzysta z kafelkowanych warstw projektu. „Aktualne” oznacza najnowszą dostępną obserwację danego sensora; nie udajemy transmisji na żywo z satelity.</p>
      </div>

      <ResearchChatNotebook apiUrl={apiUrl} place={place} analysis={analysis} advancedControls={consoleMode === 'advanced'} />
    </div>

    {!place && <div className="simple-guidance panel">
      <b>Jak zacząć:</b><span>1. Wpisz nazwę terenu.</span><span>2. Marker pojawi się na globusie.</span><span>3. Dostaniesz analizę i możesz dopytywać asystenta.</span>{consoleMode === 'simple' && <button type="button" className="secondary" onClick={() => setConsoleMode('advanced')}>Potrzebuję pomiarów i plików → Zaawansowane</button>}
    </div>}

    {(status === 'analyzing' || status === 'searching') && <div className="simple-ai-loading panel" role="status">
      <span className="simple-ai-spinner" />
      <div><b>Analizuję teren</b><p>Pobieram oficjalny katalog Landsat i reprezentatywne obrazy NASA/Copernicus. Wynik pojawi się poniżej; czat nadal jest dostępny.</p></div>
    </div>}

    {analysis && <section className="simple-basic-result panel" aria-label="Szybki wynik analizy">
      <div className="simple-result-head">
        <div><small>SZYBKI WYNIK · OFFICIAL/PUBLIC EVIDENCE</small><h2>{analysis.analysis.headline}</h2></div>
        <span className={`simple-confidence ${analysis.analysis.confidence.level}`}>pewność: {confidenceLabel(analysis.analysis.confidence.level)}</span>
      </div>
      <div className="simple-basic-result-grid">
        <article><b>Co widać</b><p>{analysis.analysis.what_is_visible}</p></article>
        <article><b>Woda / teren</b><p>{analysis.analysis.water_assessment}</p></article>
      </div>
      {consoleMode === 'simple' && <button type="button" className="secondary simple-open-advanced" onClick={() => setConsoleMode('advanced')}>Pokaż zdjęcia, pomiary i szczegóły</button>}
    </section>}

    {consoleMode === 'advanced' && <>
      {place && <div className="simple-map panel">
        <div className="simple-map-head">
          <div><small>MAPA KONTEKSTOWA</small><h3>{place.label}</h3></div>
          <a href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=10/${place.latitude}/${place.longitude}`} target="_blank" rel="noreferrer">Otwórz większą mapę</a>
        </div>
        <iframe title={`Mapa ${place.label}`} src={osmEmbedUrl(place)} loading="lazy" />
        <p className="simple-map-source">OpenStreetMap służy tu do orientacji. Pomiary i zdjęcia obserwacyjne są niżej i mają własną proweniencję.</p>
      </div>}

      {place && <ResearchTerrainLab
        apiUrl={apiUrl}
        place={place}
        satelliteDate={analysis?.preview_images.at(-1)?.date}
      />}

      {analysis && <section className="simple-ai-result panel" aria-label="Szczegółowy wynik analizy AI">
        <div className="simple-result-head">
          <div><small>OPENAI · OFFICIAL/PUBLIC SATELLITE EVIDENCE</small><h2>Szczegóły analizy</h2></div>
          <span className={`simple-confidence ${analysis.analysis.confidence.level}`}>pewność: {confidenceLabel(analysis.analysis.confidence.level)}</span>
        </div>
        <div className="simple-result-grid">
          <article><small>CO WIDAĆ</small><p>{analysis.analysis.what_is_visible}</p></article>
          <article><small>ZMIANY W CZASIE</small><p>{analysis.analysis.change_over_time}</p></article>
          <article className="water"><small>WODA</small><p>{analysis.analysis.water_assessment}</p></article>
          <article><small>PEWNOŚĆ WNIOSKU</small><p>{analysis.analysis.confidence.reason}</p></article>
        </div>

        {analysis.analysis.notable_features.length > 0 && <div className="simple-notable">
          <b>Co zwróciło uwagę AI</b>
          <ul>{analysis.analysis.notable_features.map(item => <li key={item}>{item}</li>)}</ul>
        </div>}

        <div className="simple-evidence-summary">
          <span><b>{analysis.preview_images.length}</b> zdjęć pokazanych na stronie</span>
          <span><b>{analysis.ai_visual_image_count}</b> obrazów użytych przez AI</span>
          <span><b>{analysis.landsat_catalog.matched}</b> scen w katalogu USGS</span>
        </div>

        {analysis.preview_images.length > 0 && <div className="simple-image-grid">
          {analysis.preview_images.slice(0, 10).map(image => <figure key={image.date}>
            <a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`Satelita ${image.date}`} loading="lazy" /></a>
            <figcaption><b>{image.date}</b><span>{image.source}</span><small>Dotknij zdjęcia, aby otworzyć je osobno.</small></figcaption>
          </figure>)}
        </div>}

        <div className="simple-result-actions">
          {analysis.landsat_catalog.full_catalog_url && <a className="button-link" href={analysis.landsat_catalog.full_catalog_url} target="_blank" rel="noreferrer">Pełny katalog satelitarny USGS</a>}
          {analysis.depth === 'quick' && place && <button type="button" className="secondary" onClick={() => void runAnalysis(place, 'deep')} disabled={status === 'analyzing'}>Zbadaj dokładniej całą serię lat</button>}
        </div>
        <p className="simple-full-catalog-note">Podgląd nie zastępuje oryginalnych produktów. Dla prac badawczych otwieraj obraz w pełnym rozmiarze i zapisuj datę/sensor.</p>
        <div className="simple-limitations">
          <b>Ograniczenia</b>
          <ul>{analysis.analysis.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          <p><b>Następny krok:</b> {analysis.analysis.recommended_next_step}</p>
        </div>
      </section>}

      <details className="simple-advanced panel" open>
        <summary><span><b>Ustawienia techniczne badania</b><small>współrzędne, kształt AOI, promień, pory roku, dekady, manifest</small></span><strong>Zaawansowane</strong></summary>
        <div className="simple-advanced-body">{advanced}</div>
      </details>
    </>}
  </section>
}
