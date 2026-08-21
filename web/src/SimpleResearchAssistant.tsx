import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import './simple-research.css'
import {
  analyzeResearchArea,
  searchResearchPlace,
  sendResearchChat,
  type AreaAnalysisResponse,
  type GeocodeResult,
  type ResearchChatMessage,
} from './lib/evidenceApi'
import {
  buildAssistantAnswerRecord,
  buildResearchFindingRecord,
  saveAssistantAnswerLocally,
  saveResearchFindingLocally,
} from './researchArchive'
import { parseResearchLocation } from './researchLocation'
import { RealisticEarthGlobe } from './RealisticEarthGlobe'
import { ResearchChatNotebook } from './ResearchChatNotebook'
import { ResearchTerrainLab } from './ResearchTerrainLab'

type Place = {
  label: string
  latitude: number
  longitude: number
}

type PeriodPreset = 'long' | 'five-years' | 'one-year' | 'year'
type Season = 'all' | 'spring' | 'summer' | 'autumn' | 'winter'
type ConsoleMode = 'simple' | 'advanced'
type ModePolicy = 'switchable' | ConsoleMode
type ImageMode = 'clear' | 'all'

type AnalysisOptions = {
  radiusKm?: number
  imageMode?: ImageMode
}

const LEGACY_CHAT_KEYS = [
  'terra-research-chat/v1',
  'terra-research-chat',
  'terra-ai-research-chat-v1',
  'terra-ai-chat-v1',
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function yearStart(year: number) {
  return `${year}-01-01`
}

function clampToToday(value: string) {
  return value > today() ? today() : value
}

function clampRadius(value: number) {
  if (!Number.isFinite(value)) return 25
  return Math.min(100, Math.max(1, Math.round(value)))
}

function periodForPreset(preset: PeriodPreset, selectedYear: number, season: Season) {
  const endDate = today()
  const year = Number(endDate.slice(0, 4))
  if (preset === 'one-year') return { startDate: yearStart(year - 1), endDate }
  if (preset === 'five-years') return { startDate: yearStart(year - 5), endDate }
  if (preset === 'long') return { startDate: '1990-01-01', endDate }

  const seasonRange: Record<Season, [string, string]> = {
    all: [`${selectedYear}-01-01`, `${selectedYear}-12-31`],
    spring: [`${selectedYear}-03-01`, `${selectedYear}-05-31`],
    summer: [`${selectedYear}-06-01`, `${selectedYear}-08-31`],
    autumn: [`${selectedYear}-09-01`, `${selectedYear}-11-30`],
    winter: [`${selectedYear}-01-01`, `${selectedYear}-02-28`],
  }
  const [startDate, requestedEnd] = seasonRange[season]
  const clampedEnd = clampToToday(requestedEnd)
  return startDate <= clampedEnd
    ? { startDate, endDate: clampedEnd }
    : { startDate: yearStart(selectedYear), endDate: clampToToday(`${selectedYear}-12-31`) }
}

function riverHelperEmbedUrl(place: Place) {
  const params = new URLSearchParams({
    lat: String(place.latitude),
    lon: String(place.longitude),
    label: place.label,
  })
  return `${import.meta.env.BASE_URL}river-helper-map/index.html?${params.toString()}`
}

function confidenceLabel(level: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'wysoka'
  if (level === 'medium') return 'średnia'
  return 'niska'
}

function cloudLabel(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 'brak dokładnej wartości zachmurzenia'
  return `zachmurzenie sceny: ${Number(value).toFixed(1)}%`
}

export function SimpleResearchAssistant({
  apiUrl,
  advanced,
  modePolicy = 'switchable',
}: {
  apiUrl: string
  advanced: ReactNode
  modePolicy?: ModePolicy
}) {
  const currentYear = Number(today().slice(0, 4))
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('simple')
  const effectiveMode: ConsoleMode = modePolicy === 'switchable' ? consoleMode : modePolicy
  const canSwitchMode = modePolicy === 'switchable'
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [alternatives, setAlternatives] = useState<GeocodeResult[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('long')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [season, setSeason] = useState<Season>('all')
  const [radiusKm, setRadiusKm] = useState(25)
  const [imageMode, setImageMode] = useState<ImageMode>('clear')
  const [status, setStatus] = useState<'idle' | 'searching' | 'analyzing' | 'ready' | 'error'>('idle')
  const [analysis, setAnalysis] = useState<AreaAnalysisResponse | null>(null)
  const [error, setError] = useState('')
  const [archiveNotice, setArchiveNotice] = useState('')
  const [question, setQuestion] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')
  const [assistantAnswer, setAssistantAnswer] = useState('')
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const [sessionMessages, setSessionMessages] = useState<ResearchChatMessage[]>([])
  const analysisController = useRef<AbortController | null>(null)
  const assistantController = useRef<AbortController | null>(null)
  const period = useMemo(() => periodForPreset(periodPreset, selectedYear, season), [periodPreset, selectedYear, season])
  const previewUtc = useMemo(() => new Date().toISOString(), [])
  const years = useMemo(() => Array.from({ length: currentYear - 1990 + 1 }, (_, index) => currentYear - index), [currentYear])
  const visibleImages = useMemo(() => analysis?.preview_images.slice(0, 4) ?? [], [analysis])

  useEffect(() => {
    for (const key of LEGACY_CHAT_KEYS) window.localStorage.removeItem(key)
    return () => {
      analysisController.current?.abort()
      assistantController.current?.abort()
    }
  }, [])

  const runAnalysis = async (
    target: Place,
    depth: 'quick' | 'deep' = 'quick',
    selectedPeriod = period,
    options: AnalysisOptions = {},
  ) => {
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    setStatus('analyzing')
    setError('')
    setArchiveNotice('')
    const selectedRadius = clampRadius(options.radiusKm ?? radiusKm)
    const selectedImageMode = options.imageMode ?? imageMode
    try {
      const result = await analyzeResearchArea(apiUrl, {
        latitude: target.latitude,
        longitude: target.longitude,
        radiusKm: selectedRadius,
        startDate: selectedPeriod.startDate,
        endDate: selectedPeriod.endDate,
        placeName: target.label,
        depth,
        imageMode: selectedImageMode,
        maxCloudCover: selectedImageMode === 'clear' ? 10 : 100,
        previewLimit: 4,
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
    setQuery(target.label)
    setAnalysis(null)
    setAssistantAnswer('')
    setLastQuestion('')
    setArchiveNotice('')
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
        setError('Nie znaleziono dokładnego miejsca. Dopisz gminę/powiat/kraj albo wpisz współrzędne WGS84. Wyszukiwarka korzysta z publicznego OpenStreetMap Nominatim.')
        return
      }
      choosePlace({ label: first.display_name, latitude: first.latitude, longitude: first.longitude })
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const applyPeriod = (preset = periodPreset) => {
    setPeriodPreset(preset)
    if (!place) return
    void runAnalysis(place, 'quick', periodForPreset(preset, selectedYear, season))
  }

  const applySelectedYear = (value: number) => {
    setSelectedYear(value)
    setPeriodPreset('year')
    if (place) void runAnalysis(place, 'quick', periodForPreset('year', value, season))
  }

  const applySelectedSeason = (value: Season) => {
    setSeason(value)
    setPeriodPreset('year')
    if (place) void runAnalysis(place, 'quick', periodForPreset('year', selectedYear, value))
  }

  const applyRadius = () => {
    const selected = clampRadius(radiusKm)
    setRadiusKm(selected)
    if (place) void runAnalysis(place, 'quick', period, { radiusKm: selected })
  }

  const applyImageMode = (mode: ImageMode) => {
    setImageMode(mode)
    if (place) void runAnalysis(place, 'quick', period, { imageMode: mode })
  }

  const sendQuestion = async (event: FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!text || !apiUrl || assistantBusy) return
    assistantController.current?.abort()
    const controller = new AbortController()
    assistantController.current = controller
    const nextMessages: ResearchChatMessage[] = [...sessionMessages, { role: 'user', text }]
    setLastQuestion(text)
    setAssistantAnswer('')
    setAssistantBusy(true)
    setAssistantError('')
    try {
      const result = await sendResearchChat(apiUrl, {
        model: 'gpt-5.6-terra',
        messages: nextMessages,
        context: {
          selected_place: place,
          selected_radius_km: radiusKm,
          selected_image_mode: imageMode,
          area_analysis: analysis ? {
            generated_at_utc: analysis.generated_at_utc,
            area: analysis.area,
            period: analysis.period,
            image_policy: analysis.image_policy,
            evidence_policy: analysis.evidence_policy,
            preview_sources: analysis.preview_images.slice(0, 4).map(item => ({
              date: item.date,
              source: item.source,
              cloud_cover: item.cloud_cover ?? null,
              scene_id: item.scene_id ?? null,
            })),
            landsat_catalog: {
              matched: analysis.landsat_catalog.matched,
              scenes: analysis.landsat_catalog.scenes,
            },
            analysis: analysis.analysis,
          } : null,
        },
      }, controller.signal)
      const updatedMessages: ResearchChatMessage[] = [...nextMessages, { role: 'assistant', text: result.answer }]
      setSessionMessages(updatedMessages)
      setAssistantAnswer(result.answer)
      setQuestion('')
      saveAssistantAnswerLocally(buildAssistantAnswerRecord({ answer: result.answer, model: result.model, place }))
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setAssistantError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setAssistantBusy(false)
    }
  }

  const saveCurrentFinding = () => {
    if (!analysis) return
    const finding = buildResearchFindingRecord(analysis)
    saveResearchFindingLocally(finding)
    setArchiveNotice(`Zapisano „${finding.title}”: obrazy źródłowe i wnioski AI. Treść prywatnego pytania nie została zapisana.`)
  }

  const globeMarkers = place ? [{ longitude: place.longitude, latitude: place.latitude, color: 0x35cfff, radius: 1.35 }] : []
  const catalogAllYears = analysis?.landsat_catalog.all_years_catalog_url ?? analysis?.landsat_catalog.full_catalog_url ?? null

  return <section className="simple-research" aria-label="AI terrain research">
    {canSwitchMode && <div className="simple-console-mode panel" role="group" aria-label="Research interface level">
      <button type="button" className={effectiveMode === 'simple' ? 'active' : ''} onClick={() => setConsoleMode('simple')}><b>Prosty</b><span>miejsce → czyste obrazy → pytanie → Ziemia 3D → wynik</span></button>
      <button type="button" className={effectiveMode === 'advanced' ? 'active' : ''} onClick={() => setConsoleMode('advanced')}><b>Zaawansowany</b><span>obrazy HQ · pliki · modele · flagi · DEM · profile · raporty</span></button>
    </div>}

    <section className="simple-research-hero panel simple-workflow-card">
      <div className="simple-research-copy">
        <small>MAPA · SATELITY · OPENAI</small>
        <h2>Wpisz miejsce. Resztę przygotuje system.</h2>
        <p>Domyślnie wybieramy możliwie czyste obrazy do badania rzek i terenu: Landsat z raportowanym zachmurzeniem do 10% oraz Copernicus Sentinel-2 z filtrem MAXCC. Na stronie pokazujemy najwyżej 4 obrazy; cały katalog pozostaje dostępny osobno.</p>
      </div>
      <form className="simple-search" onSubmit={submitSearch}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="np. Olszówka gmina Gardeja, Jezioro Kuchnia, Wisła pod Gniewem…" aria-label="Wyszukaj miejsce do badania" />
        <button type="submit" className="primary" disabled={!apiUrl || status === 'searching' || status === 'analyzing'}>{status === 'searching' ? 'Szukam…' : status === 'analyzing' ? 'Analizuję…' : 'Zbadaj teren'}</button>
      </form>

      <div className="simple-periods" role="group" aria-label="Zakres czasu badania">
        <button type="button" className={periodPreset === 'long' ? 'active' : ''} onClick={() => applyPeriod('long')}>1990–dziś</button>
        <button type="button" className={periodPreset === 'five-years' ? 'active' : ''} onClick={() => applyPeriod('five-years')}>ostatnie 5 lat</button>
        <button type="button" className={periodPreset === 'one-year' ? 'active' : ''} onClick={() => applyPeriod('one-year')}>ostatni rok</button>
      </div>

      <div className="simple-history-controls">
        <label>Rok<select value={selectedYear} onChange={event => applySelectedYear(Number(event.target.value))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Pora<select value={season} onChange={event => applySelectedSeason(event.target.value as Season)}><option value="all">cały rok</option><option value="spring">wiosna</option><option value="summer">lato</option><option value="autumn">jesień</option><option value="winter">zima</option></select></label>
        <button type="button" className="secondary" onClick={() => applyPeriod('year')} disabled={!place}>Odśwież wybrany okres</button>
      </div>

      <div className="simple-imagery-controls" aria-label="Ustawienia obszaru i zachmurzenia">
        <div className="simple-radius-control">
          <div className="simple-control-title"><b>Promień badanego obszaru</b><span>{radiusKm} km</span></div>
          <input type="range" min="1" max="100" step="1" value={radiusKm} onChange={event => setRadiusKm(clampRadius(Number(event.target.value)))} aria-label="Promień obszaru w kilometrach" />
          <div className="simple-radius-manual"><label>Wpisz ręcznie<input type="number" min="1" max="100" step="1" value={radiusKm} onChange={event => setRadiusKm(clampRadius(Number(event.target.value)))} /></label><button type="button" className="secondary" onClick={applyRadius} disabled={!place}>Zastosuj {radiusKm} km</button></div>
          <small>Zakres prostego widoku: 1–100 km od środka wyszukanego miejsca.</small>
        </div>
        <div className="simple-cloud-control">
          <div className="simple-control-title"><b>Zdjęcia do analizy</b><span>{imageMode === 'clear' ? 'czyste ≤10%' : 'wszystkie'}</span></div>
          <div className="simple-image-mode-buttons">
            <button type="button" className={imageMode === 'clear' ? 'active' : ''} onClick={() => applyImageMode('clear')}><b>Czyste do badania rzek</b><span>priorytet ≤10% chmur</span></button>
            <button type="button" className={imageMode === 'all' ? 'active' : ''} onClick={() => applyImageMode('all')}><b>Pochmurne / wszystkie</b><span>opcjonalnie, gdy są potrzebne</span></button>
          </div>
          <small>Tryb czysty odrzuca Landsat bez potwierdzonej wartości zachmurzenia lub powyżej progu. Jeśli nie ma dobrych scen, system pokaże mniej niż 4 zamiast podstawiać gorsze zdjęcia.</small>
        </div>
      </div>

      {alternatives.length > 1 && <details className="simple-search-alternatives" open><summary>Znalezione miejsca — wybierz właściwe, jeśli pierwszy wynik nie jest dokładny</summary><div>{alternatives.slice(0, 10).map(item => <button type="button" key={`${item.latitude}-${item.longitude}`} onClick={() => choosePlace({ label: item.display_name, latitude: item.latitude, longitude: item.longitude })}>{item.display_name}</button>)}</div></details>}
      {error && <p className="research-error" role="alert">{error}</p>}
    </section>

    {effectiveMode === 'simple' && <section className="simple-question panel" aria-label="Prywatne pytanie do asystenta">
      <div><small>OPENAI · PYTANIE PRYWATNE · TYLKO SESJA</small><h3>Zapytaj asystenta</h3><p>Asystent dostaje wybrane miejsce, promień, okres oraz dokładnie te oficjalne obrazy, które przeszły filtr i kontrolę Workera.</p></div>
      <div>
        <form onSubmit={sendQuestion}><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Zapytaj o wybrane miejsce, zdjęcia, rzeki, teren lub zmiany w czasie…" rows={3} /><div className="simple-question-actions"><button type="submit" className="primary" disabled={!apiUrl || assistantBusy || !question.trim()}>{assistantBusy ? 'Asystent analizuje…' : 'Wyślij prywatnie'}</button><button type="button" className="secondary" onClick={() => { setSessionMessages([]); setAssistantAnswer(''); setLastQuestion(''); setQuestion(''); setAssistantError('') }}>Nowe pytanie</button></div></form>
        {lastQuestion && <article className="simple-question-answer"><small>TWOJE PYTANIE</small><p>{lastQuestion}</p></article>}
        {assistantBusy && <article className="simple-question-answer"><small>OPENAI</small><p>Analizuję dane dla wybranego miejsca i okresu…</p></article>}
        {assistantAnswer && <article className="simple-question-answer"><small>ODPOWIEDŹ ASYSTENTA</small><p>{assistantAnswer}</p></article>}
        {assistantError && <p className="research-error" role="alert">{assistantError}</p>}
      </div>
    </section>}

    {(status === 'analyzing' || status === 'searching') && <div className="simple-ai-loading panel" role="status"><span className="simple-ai-spinner" /><div><b>Przygotowuję prawdziwe dane</b><p>{imageMode === 'clear' ? 'Szukam scen o małym zachmurzeniu i przygotowuję maksymalnie 4 obrazy do analizy.' : 'Tryb rozszerzony: dopuszczam także obrazy pochmurne i NASA GIBS.'}</p></div></div>}

    {analysis && <section className="simple-context-gallery panel" aria-label="Prawdziwe obrazy satelitarne wybranego okresu">
      <div className="simple-section-head"><div><small>{analysis.image_policy?.mode === 'all' ? 'OFICJALNE OBRAZY · TRYB WSZYSTKIE' : 'OFICJALNE OBRAZY · TRYB CZYSTY'}</small><h2>{place?.label}</h2><p>Obszar: promień <b>{analysis.area.radius_km} km</b>. Okres: <b>{analysis.period.start_date} → {analysis.period.end_date}</b>. Na tej stronie pokazujemy maksymalnie cztery obrazy; pozostałe sceny zostają w katalogu satelity.</p></div></div>
      {visibleImages.length > 0 && <div className="simple-context-grid">{visibleImages.map((image, index) => <figure key={`${image.date}-${image.source}-${index}`}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${image.source} ${image.date}`} loading="lazy" /></a><figcaption><b>{String(index + 1).padStart(2, '0')} · {image.date}</b><span>{image.source}</span><small>{cloudLabel(image.cloud_cover)}{image.scene_id ? ` · scena ${image.scene_id}` : ''}</small></figcaption></figure>)}</div>}
      {visibleImages.length === 0 && <div className="simple-no-clean-images"><p>W tym okresie Worker nie znalazł renderowalnej sceny spełniającej aktualny filtr. Nie podstawiamy pochmurnego obrazu jako „czystego”.</p>{imageMode === 'clear' && <button type="button" className="secondary" onClick={() => applyImageMode('all')}>Pokaż także pochmurne / wszystkie</button>}</div>}
      <div className="simple-catalog-actions">
        {analysis.landsat_catalog.full_catalog_url && <a href={analysis.landsat_catalog.full_catalog_url} target="_blank" rel="noreferrer">Katalog Landsat dla wybranego okresu</a>}
        {catalogAllYears && <a href={catalogAllYears} target="_blank" rel="noreferrer">Pełny katalog Landsat 1972–dziś dla tego obszaru</a>}
      </div>
    </section>}

    <div className="simple-console-grid" style={effectiveMode === 'simple' ? { gridTemplateColumns: '1fr' } : undefined}>
      <div className="simple-map panel simple-earth-preview">
        <div className="simple-map-head"><div><small>ZIEMIA 3D · KAFELKOWA MAPA REFERENCYJNA</small><h3>{place ? place.label : 'Obróć Ziemię lub najpierw wyszukaj miejsce'}</h3></div><span>{place ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : 'Cesium · WGS84 · high-resolution basemap'}</span></div>
        <RealisticEarthGlobe selectedTime={previewUtc} markers={globeMarkers} />
        <p className="simple-map-source">Warstwa wysokiej rozdzielczości służy do orientacji w terenie i śledzenia koryt. Datowane wnioski naukowe muszą pochodzić z oficjalnych obserwacji Copernicus/NASA/USGS.</p>
      </div>
      {effectiveMode === 'advanced' && <ResearchChatNotebook apiUrl={apiUrl} place={place} analysis={analysis} advancedControls />}
    </div>

    {place && <div className="simple-map panel simple-river-helper">
      <div className="simple-map-head"><div><small>MAPA POMOCNICZA · PAŃSTWA + RZEKI</small><h3>{place.label}</h3></div><a href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=10/${place.latitude}/${place.longitude}`} target="_blank" rel="noreferrer">Otwórz pełną mapę</a></div>
      <iframe title={`Mapa rzek dla ${place.label}`} src={riverHelperEmbedUrl(place)} loading="lazy" />
      <p className="simple-map-source">Natural Earth: państwa, główne rzeki i jeziora. Granice prowincji/admin-1 oraz gęste etykiety lokalne są celowo ukryte, aby mapa pomagała badać przebieg koryt.</p>
    </div>}

    {analysis && <section className="simple-basic-result panel" aria-label="Opis i podsumowanie badanego miejsca">
      <div className="simple-result-head"><div><small>OPENAI · OFICJALNE/PUBLICZNE DOWODY</small><h2>{analysis.analysis.headline}</h2></div><span className={`simple-confidence ${analysis.analysis.confidence.level}`}>pewność: {confidenceLabel(analysis.analysis.confidence.level)}</span></div>
      <div className="simple-basic-result-grid"><article><b>Co widać</b><p>{analysis.analysis.what_is_visible}</p></article><article><b>Zmiany w czasie</b><p>{analysis.analysis.change_over_time}</p></article><article><b>Woda / teren</b><p>{analysis.analysis.water_assessment}</p></article><article><b>Ograniczenia i pewność</b><p>{analysis.analysis.confidence.reason}</p></article></div>{analysis.analysis.notable_features.length > 0 && <div className="simple-notable"><b>Na co zwrócił uwagę AI</b><ul>{analysis.analysis.notable_features.map(item => <li key={item}>{item}</li>)}</ul></div>}<div className="simple-result-actions"><button type="button" className="secondary" onClick={saveCurrentFinding}>Zapisz obrazy + wnioski</button>{canSwitchMode && effectiveMode === 'simple' && <button type="button" className="secondary" onClick={() => setConsoleMode('advanced')}>Otwórz pełny stary widok zaawansowany</button>}</div>{archiveNotice && <p className="simple-archive-notice" role="status">{archiveNotice}</p>}
    </section>}

    {analysis && <details className="simple-history panel" open={effectiveMode === 'advanced' || periodPreset === 'year'}>
      <summary><span><small>ARCHIWUM OBRAZÓW · PEŁNY KATALOG</small><b>Sceny satelitarne bez ładowania setek miniaturek</b></span><em>Rozwiń</em></summary>
      <div className="simple-history-body"><p>Interfejs celowo ładuje tylko do 4 obrazów. Pełna lista scen pozostaje po stronie oficjalnego katalogu USGS Landsat, dzięki czemu telefon nie pobiera dziesiątek lub setek zdjęć naraz.</p><div className="simple-evidence-summary"><span><b>{visibleImages.length}</b> obrazów na stronie</span><span><b>{analysis.ai_visual_image_count}</b> obrazów obejrzanych przez AI</span><span><b>{analysis.landsat_catalog.matched}</b> scen dopasowanych w katalogu</span></div><div className="simple-catalog-actions">{analysis.landsat_catalog.full_catalog_url && <a href={analysis.landsat_catalog.full_catalog_url} target="_blank" rel="noreferrer">Otwórz katalog dla wybranego okresu</a>}{catalogAllYears && <a href={catalogAllYears} target="_blank" rel="noreferrer">Otwórz cały katalog 1972–dziś</a>}</div></div>
    </details>}

    {effectiveMode === 'advanced' && <>{place && <ResearchTerrainLab apiUrl={apiUrl} place={place} satelliteDate={analysis?.period.end_date} />}{analysis && <section className="simple-ai-result panel" aria-label="Detailed AI analysis result"><div className="simple-result-head"><div><small>TRYB ZAAWANSOWANY · DOWODY</small><h2>Szczegółowa analiza</h2></div><span className={`simple-confidence ${analysis.analysis.confidence.level}`}>pewność: {confidenceLabel(analysis.analysis.confidence.level)}</span></div><div className="simple-result-grid"><article><small>CO WIDAĆ</small><p>{analysis.analysis.what_is_visible}</p></article><article><small>ZMIANY W CZASIE</small><p>{analysis.analysis.change_over_time}</p></article><article className="water"><small>WODA</small><p>{analysis.analysis.water_assessment}</p></article><article><small>PEWNOŚĆ</small><p>{analysis.analysis.confidence.reason}</p></article></div><div className="simple-limitations"><b>Ograniczenia</b><ul>{analysis.analysis.limitations.map(item => <li key={item}>{item}</li>)}</ul><p><b>Następny krok:</b> {analysis.analysis.recommended_next_step}</p></div></section>}<details className="simple-advanced panel" open><summary><span><b>Zaawansowany obszar badawczy</b><small>kształt, dokładne daty, manifest i zapis projektu</small></span><strong>ROZWIŃ</strong></summary><div className="simple-advanced-body">{advanced}</div></details></>}

    {!place && <div className="simple-guidance panel"><b>Jak zacząć:</b><span>1. Ustaw promień 1–100 km.</span><span>2. Zostaw „Czyste do badania rzek”.</span><span>3. Wpisz miejsce i wybierz rok/pora roku.</span></div>}
  </section>
}
