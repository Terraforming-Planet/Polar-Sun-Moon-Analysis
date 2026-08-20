import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import './simple-research.css'
import {
  analyzeResearchArea,
  searchResearchPlace,
  type AreaAnalysisResponse,
  type GeocodeResult,
} from './lib/evidenceApi'
import { buildResearchFindingRecord, saveResearchFindingLocally } from './researchArchive'
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
type ModePolicy = 'switchable' | ConsoleMode

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
  if (level === 'high') return 'high'
  if (level === 'medium') return 'medium'
  return 'low'
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
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('simple')
  const effectiveMode: ConsoleMode = modePolicy === 'switchable' ? consoleMode : modePolicy
  const canSwitchMode = modePolicy === 'switchable'
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [alternatives, setAlternatives] = useState<GeocodeResult[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('long')
  const [status, setStatus] = useState<'idle' | 'searching' | 'analyzing' | 'ready' | 'error'>('idle')
  const [analysis, setAnalysis] = useState<AreaAnalysisResponse | null>(null)
  const [error, setError] = useState('')
  const [archiveNotice, setArchiveNotice] = useState('')
  const analysisController = useRef<AbortController | null>(null)
  const period = useMemo(() => periodForPreset(periodPreset), [periodPreset])
  const previewUtc = useMemo(() => new Date().toISOString(), [])

  const runAnalysis = async (target: Place, depth: 'quick' | 'deep' = 'quick') => {
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    setStatus('analyzing')
    setError('')
    setArchiveNotice('')
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
        label: `Selected point ${direct.latitude.toFixed(4)}, ${direct.longitude.toFixed(4)}`,
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
        setError('Place not found. Try a city, lake, river, region or WGS84 coordinates.')
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
    setArchiveNotice('')
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

  const saveCurrentFinding = () => {
    if (!analysis) return
    const finding = buildResearchFindingRecord(analysis)
    saveResearchFindingLocally(finding)
    setArchiveNotice(`Saved “${finding.title}”: ${finding.source_images.length} source-image links plus AI findings. No user question or raw chat was stored.`)
  }

  const globeMarkers = place ? [{
    longitude: place.longitude,
    latitude: place.latitude,
    color: 0x35cfff,
    radius: 1.35,
  }] : []

  return <section className="simple-research" aria-label="AI terrain research">
    {canSwitchMode && <div className="simple-console-mode panel" role="group" aria-label="Research interface level">
      <button type="button" className={effectiveMode === 'simple' ? 'active' : ''} onClick={() => setConsoleMode('simple')}>
        <b>Simple</b><span>search a place → inspect Earth → ask the assistant</span>
      </button>
      <button type="button" className={effectiveMode === 'advanced' ? 'active' : ''} onClick={() => setConsoleMode('advanced')}>
        <b>Advanced</b><span>HQ imagery · files · models · flags · DEM · profiles · reports</span>
      </button>
    </div>}

    <div className="simple-research-hero panel">
      <div className="simple-research-copy">
        <small>{effectiveMode === 'simple' ? 'SIMPLE CONSOLE · 3D EARTH · SATELLITES · ASSISTANT' : 'LABORATORY · SATELLITES · DEM · OPENAI'}</small>
        <h2>{effectiveMode === 'simple' ? 'Search any area and investigate it immediately' : 'Advanced terrain research'}</h2>
        <p>{effectiveMode === 'simple'
          ? 'Enter a lake, river, city or region. The system marks it on the 3D Earth view, retrieves available official evidence and returns a concise analysis. The assistant stays beside the map for follow-up questions.'
          : 'Use the full laboratory: GPT model selection, attachments, high-quality Copernicus/NASA imagery, numbered flags, DEM samples, colored paths, elevation profiles and reports.'}</p>
      </div>
      <form className="simple-search" onSubmit={submitSearch}>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="e.g. Nile, Lake Tana, Vistula near Gniew, Sahara…"
          aria-label="Search for a place to investigate"
        />
        <button type="submit" className="primary" disabled={!apiUrl || status === 'searching' || status === 'analyzing'}>
          {status === 'searching' ? 'Searching…' : status === 'analyzing' ? 'AI is analyzing…' : 'Research area'}
        </button>
      </form>

      <div className="simple-periods" role="group" aria-label="Research time range">
        <button type="button" className={periodPreset === 'long' ? 'active' : ''} onClick={() => rerunForPeriod('long')}>1990–today</button>
        <button type="button" className={periodPreset === 'five-years' ? 'active' : ''} onClick={() => rerunForPeriod('five-years')}>last 5 years</button>
        <button type="button" className={periodPreset === 'one-year' ? 'active' : ''} onClick={() => rerunForPeriod('one-year')}>last year</button>
      </div>

      {alternatives.length > 1 && <details className="simple-search-alternatives">
        <summary>Other matching places</summary>
        <div>{alternatives.slice(1).map(item => <button type="button" key={`${item.latitude}-${item.longitude}`} onClick={() => choosePlace({ label: item.display_name, latitude: item.latitude, longitude: item.longitude })}>{item.display_name}</button>)}</div>
      </details>}
      {error && <p className="research-error" role="alert">{error}</p>}
    </div>

    <div className="simple-console-grid">
      <div className="simple-map panel simple-earth-preview">
        <div className="simple-map-head">
          <div><small>3D EARTH · HIGH-RESOLUTION REFERENCE VIEW</small><h3>{place ? place.label : 'Rotate Earth or search for a place'}</h3></div>
          <span>{place ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : 'Cesium · WGS84 · high-resolution basemap'}</span>
        </div>
        <RealisticEarthGlobe selectedTime={previewUtc} markers={globeMarkers} />
        <p className="simple-map-source">The high-resolution reference basemap is the default visual layer because it is useful for tracing riverbeds and terrain. Dated scientific conclusions must still be checked against official Copernicus, NASA and USGS observations.</p>
      </div>

      <ResearchChatNotebook apiUrl={apiUrl} place={place} analysis={analysis} advancedControls={effectiveMode === 'advanced'} />
    </div>

    {!place && <div className="simple-guidance panel">
      <b>How to start:</b><span>1. Enter a place.</span><span>2. A marker appears on the 3D Earth view.</span><span>3. Review the analysis and ask private follow-up questions.</span>{canSwitchMode && effectiveMode === 'simple' && <button type="button" className="secondary" onClick={() => setConsoleMode('advanced')}>I need measurements and files → Advanced</button>}
    </div>}

    {(status === 'analyzing' || status === 'searching') && <div className="simple-ai-loading panel" role="status">
      <span className="simple-ai-spinner" />
      <div><b>Analyzing the area</b><p>Retrieving the official Landsat catalogue and representative NASA/Copernicus imagery. The result appears below; the assistant remains available.</p></div>
    </div>}

    {analysis && <section className="simple-basic-result panel" aria-label="Quick analysis result">
      <div className="simple-result-head">
        <div><small>QUICK RESULT · OFFICIAL/PUBLIC EVIDENCE</small><h2>{analysis.analysis.headline}</h2></div>
        <span className={`simple-confidence ${analysis.analysis.confidence.level}`}>confidence: {confidenceLabel(analysis.analysis.confidence.level)}</span>
      </div>
      <div className="simple-basic-result-grid">
        <article><b>What is visible</b><p>{analysis.analysis.what_is_visible}</p></article>
        <article><b>Water / terrain</b><p>{analysis.analysis.water_assessment}</p></article>
      </div>
      <div className="simple-result-actions">
        <button type="button" className="secondary" onClick={saveCurrentFinding}>Save imagery + findings</button>
        {canSwitchMode && effectiveMode === 'simple' && <button type="button" className="secondary" onClick={() => setConsoleMode('advanced')}>Show imagery, measurements and details</button>}
      </div>
      {archiveNotice && <p className="simple-archive-notice" role="status">{archiveNotice}</p>}
    </section>}

    {effectiveMode === 'advanced' && <>
      {place && <div className="simple-map panel">
        <div className="simple-map-head">
          <div><small>CONTEXT MAP</small><h3>{place.label}</h3></div>
          <a href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=10/${place.latitude}/${place.longitude}`} target="_blank" rel="noreferrer">Open larger map</a>
        </div>
        <iframe title={`Map of ${place.label}`} src={osmEmbedUrl(place)} loading="lazy" />
        <p className="simple-map-source">OpenStreetMap is used for orientation. Measurement and observation imagery below keep their own provenance.</p>
      </div>}

      {place && <ResearchTerrainLab
        apiUrl={apiUrl}
        place={place}
        satelliteDate={analysis?.preview_images.at(-1)?.date}
      />}

      {analysis && <section className="simple-ai-result panel" aria-label="Detailed AI analysis result">
        <div className="simple-result-head">
          <div><small>OPENAI · OFFICIAL/PUBLIC SATELLITE EVIDENCE</small><h2>Detailed analysis</h2></div>
          <span className={`simple-confidence ${analysis.analysis.confidence.level}`}>confidence: {confidenceLabel(analysis.analysis.confidence.level)}</span>
        </div>
        <div className="simple-result-grid">
          <article><small>WHAT IS VISIBLE</small><p>{analysis.analysis.what_is_visible}</p></article>
          <article><small>CHANGE OVER TIME</small><p>{analysis.analysis.change_over_time}</p></article>
          <article className="water"><small>WATER</small><p>{analysis.analysis.water_assessment}</p></article>
          <article><small>CONFIDENCE</small><p>{analysis.analysis.confidence.reason}</p></article>
        </div>

        {analysis.analysis.notable_features.length > 0 && <div className="simple-notable">
          <b>Features highlighted by AI</b>
          <ul>{analysis.analysis.notable_features.map(item => <li key={item}>{item}</li>)}</ul>
        </div>}

        <div className="simple-evidence-summary">
          <span><b>{analysis.preview_images.length}</b> images shown on the page</span>
          <span><b>{analysis.ai_visual_image_count}</b> images inspected by AI</span>
          <span><b>{analysis.landsat_catalog.matched}</b> scenes matched in USGS catalogue</span>
        </div>

        {analysis.preview_images.length > 0 && <div className="simple-image-grid">
          {analysis.preview_images.slice(0, 10).map(image => <figure key={`${image.date}-${image.source}`}>
            <a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`Satellite observation ${image.date}`} loading="lazy" /></a>
            <figcaption><b>{image.date}</b><span>{image.source}</span><small>Tap the image to open it separately.</small></figcaption>
          </figure>)}
        </div>}

        <div className="simple-result-actions">
          <button type="button" className="secondary" onClick={saveCurrentFinding}>Save imagery + findings only</button>
          {analysis.landsat_catalog.full_catalog_url && <a className="button-link" href={analysis.landsat_catalog.full_catalog_url} target="_blank" rel="noreferrer">Open full USGS satellite catalogue</a>}
          {analysis.depth === 'quick' && place && <button type="button" className="secondary" onClick={() => void runAnalysis(place, 'deep')} disabled={status === 'analyzing'}>Analyze the full time series in more detail</button>}
        </div>
        {archiveNotice && <p className="simple-archive-notice" role="status">{archiveNotice}</p>}
        <p className="simple-full-catalog-note">A preview does not replace an original product. For research work, open full-resolution imagery and record the date/sensor. Result archives exclude user question text and raw chat history.</p>
        <div className="simple-limitations">
          <b>Limitations</b>
          <ul>{analysis.analysis.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          <p><b>Next step:</b> {analysis.analysis.recommended_next_step}</p>
        </div>
      </section>}

      <details className="simple-advanced panel" open>
        <summary><span><b>Technical research settings</b><small>coordinates, AOI shape, radius, seasons, decades, manifest</small></span><strong>Advanced</strong></summary>
        <div className="simple-advanced-body">{advanced}</div>
      </details>
    </>}
  </section>
}
