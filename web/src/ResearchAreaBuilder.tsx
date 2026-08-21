import { useEffect, useMemo, useState } from 'react'

import './ai-research-map.css'
import { ResearchDataPreview } from './ResearchDataPreview'
import {
  buildResearchManifest,
  downloadResearchManifest,
  saveResearchManifestLocally,
  type ResearchAnalysisKind,
  type ResearchManifest,
} from './researchArchive'
import { researchShapeLabel, type ResearchAreaShape } from './researchGeometry'
import {
  googleMapsCoordinateUrl,
  googleMapsSearchUrl,
  parseResearchLocation,
} from './researchLocation'
import {
  periodForPreset,
  temporalPresetLabel,
  type ResearchTemporalPreset,
} from './researchTime'

const ANALYSIS_OPTIONS: Array<{ id: ResearchAnalysisKind; label: string; description: string }> = [
  { id: 'water-change', label: 'Surface-water change', description: 'compare shorelines, reservoirs and wetlands' },
  { id: 'hydrology', label: 'Hydrology and flow', description: 'rivers, channels, ditches, tributaries, outlets and water-network context' },
  { id: 'terrain', label: 'Terrain / DEM', description: 'elevation, gradients, valleys, watersheds and landform context' },
  { id: 'hazards', label: 'Hazards', description: 'fires, floods and other registered public warning sources' },
  { id: 'multispectral', label: 'Multispectral analysis', description: 'compare official satellite products and seasons' },
]

const SHAPE_OPTIONS: Array<{ id: ResearchAreaShape; label: string; symbol: string }> = [
  { id: 'circle', label: 'Circle', symbol: '○' },
  { id: 'square', label: 'Square', symbol: '□' },
  { id: 'triangle', label: 'Triangle', symbol: '△' },
]

const TEMPORAL_OPTIONS: Array<{ id: ResearchTemporalPreset; label: string }> = [
  { id: 'custom', label: 'Custom range' },
  { id: 'date', label: 'Exact date' },
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
  { id: 'year', label: 'Full year' },
  { id: 'decade', label: 'Decade' },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function formatCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(5) : '0.00000'
}

type SyncedPlace = { label: string; latitude: number; longitude: number }

function selectedPlaceFromSimpleMap(): SyncedPlace | null {
  if (typeof document === 'undefined') return null
  const frame = document.querySelector<HTMLIFrameElement>('.simple-river-helper iframe')
  if (!frame?.src) return null
  try {
    const url = new URL(frame.src, window.location.href)
    const latitude = Number(url.searchParams.get('lat'))
    const longitude = Number(url.searchParams.get('lon'))
    const label = url.searchParams.get('label')?.trim() || 'Selected research area'
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { label, latitude, longitude }
  } catch {
    return null
  }
}

function hydrologyMapUrl(latitude: number, longitude: number, label: string, radiusKm: number, shape: ResearchAreaShape) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    label,
    radius: String(radiusKm),
    shape,
    mode: 'hydrology',
    editable: '1',
  })
  return `${import.meta.env.BASE_URL}river-helper-map/index.html?${params.toString()}`
}

export function ResearchAreaBuilder({ onOpenArchive }: { onOpenArchive: () => void }) {
  const initialPlace = selectedPlaceFromSimpleMap()
  const [title, setTitle] = useState('New area research')
  const [latitude, setLatitude] = useState(initialPlace?.latitude ?? 53.5914)
  const [longitude, setLongitude] = useState(initialPlace?.longitude ?? 19.010717)
  const [mapLabel, setMapLabel] = useState(initialPlace?.label ?? 'Kuchnia / Olszówka')
  const [radiusKm, setRadiusKm] = useState(25)
  const [shape, setShape] = useState<ResearchAreaShape>('circle')
  const [startDate, setStartDate] = useState('1990-01-01')
  const [endDate, setEndDate] = useState('2026-12-31')
  const [temporalPreset, setTemporalPreset] = useState<ResearchTemporalPreset>('custom')
  const [periodYear, setPeriodYear] = useState(2026)
  const [exactDate, setExactDate] = useState('2026-08-20')
  const [googleQuery, setGoogleQuery] = useState(initialPlace?.label ?? 'Kuchnia Olszówka')
  const [googleLocation, setGoogleLocation] = useState('')
  const [analyses, setAnalyses] = useState<ResearchAnalysisKind[]>(['water-change', 'hydrology', 'terrain'])
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState<ResearchManifest | null>(null)
  const [error, setError] = useState('')

  const riverMapUrl = useMemo(
    () => hydrologyMapUrl(latitude, longitude, mapLabel, radiusKm, shape),
    [latitude, longitude, mapLabel, radiusKm, shape],
  )

  useEffect(() => {
    const syncFromSimpleResearch = () => {
      const selected = selectedPlaceFromSimpleMap()
      if (!selected) return
      setLatitude(current => Math.abs(current - selected.latitude) < 1e-7 ? current : selected.latitude)
      setLongitude(current => Math.abs(current - selected.longitude) < 1e-7 ? current : selected.longitude)
      setMapLabel(current => current === selected.label ? current : selected.label)
      setGoogleQuery(current => current === selected.label ? current : selected.label)
    }

    syncFromSimpleResearch()
    const observer = new MutationObserver(syncFromSimpleResearch)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })

    const receiveMapPoint = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data as { type?: unknown; latitude?: unknown; longitude?: unknown }
      if (payload?.type !== 'terra-river-map-point') return
      const nextLatitude = Number(payload.latitude)
      const nextLongitude = Number(payload.longitude)
      if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) return
      setLatitude(Number(nextLatitude.toFixed(6)))
      setLongitude(Number(nextLongitude.toFixed(6)))
      setMapLabel(`Wybrany punkt ${nextLatitude.toFixed(4)}, ${nextLongitude.toFixed(4)}`)
    }
    window.addEventListener('message', receiveMapPoint)

    return () => {
      observer.disconnect()
      window.removeEventListener('message', receiveMapPoint)
    }
  }, [])

  const toggleAnalysis = (kind: ResearchAnalysisKind) => {
    setAnalyses(current => current.includes(kind) ? current.filter(item => item !== kind) : [...current, kind])
  }

  const applyTemporalPreset = (preset: ResearchTemporalPreset, year = periodYear, date = exactDate) => {
    setTemporalPreset(preset)
    const next = periodForPreset(preset, year, date, { startDate, endDate })
    setStartDate(next.startDate)
    setEndDate(next.endDate)
  }

  const updatePeriodYear = (value: number) => {
    const year = clamp(Math.round(value), 1972, 2100)
    setPeriodYear(year)
    if (temporalPreset !== 'custom' && temporalPreset !== 'date') {
      const next = periodForPreset(temporalPreset, year, exactDate, { startDate, endDate })
      setStartDate(next.startDate)
      setEndDate(next.endDate)
    }
  }

  const updateExactDate = (value: string) => {
    setExactDate(value)
    if (temporalPreset === 'date') {
      setStartDate(value)
      setEndDate(value)
    }
  }

  const importGoogleLocation = () => {
    const parsed = parseResearchLocation(googleLocation)
    if (!parsed) {
      setError('Could not read the coordinates. Paste a Google Maps link containing coordinates or enter a pair such as 53.5914, 19.010717.')
      return
    }
    const nextLatitude = Number(parsed.latitude.toFixed(6))
    const nextLongitude = Number(parsed.longitude.toFixed(6))
    setLatitude(nextLatitude)
    setLongitude(nextLongitude)
    setMapLabel(`Wybrany punkt ${nextLatitude.toFixed(4)}, ${nextLongitude.toFixed(4)}`)
    setError('')
  }

  const applyPreset = (label: string, nextLatitude: number, nextLongitude: number, nextRadius: number) => {
    setLatitude(nextLatitude)
    setLongitude(nextLongitude)
    setRadiusKm(nextRadius)
    setMapLabel(label)
    setGoogleQuery(label)
  }

  const prepareManifest = () => {
    try {
      const manifest = buildResearchManifest({
        title,
        latitude,
        longitude,
        radiusKm,
        shape,
        startDate,
        endDate,
        temporalPreset,
        analyses,
        notes,
      })
      saveResearchManifestLocally(manifest)
      setSaved(manifest)
      setError('')
    } catch (reason) {
      setSaved(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return <section className="research-builder" aria-label="New area research builder">
    <div className="research-builder-grid">
      <div className="research-form panel">
        <div className="research-section-head">
          <div><small>NEW RESEARCH · AREA MANIFEST</small><h2>Select an area and prepare a study</h2></div>
          <span className="evidence-badge observation">OFFICIAL / PUBLIC DATA ONLY</span>
        </div>
        <p className="muted">Choose a place, AOI shape and size, then select the observation period. The manifest remains a local draft until official-source data are loaded.</p>

        <label className="research-field">Research title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
        <div className="research-coordinate-grid">
          <label className="research-field">Latitude<input type="number" min="-90" max="90" step="0.00001" value={latitude} onChange={event => setLatitude(Number(event.target.value))} /></label>
          <label className="research-field">Longitude<input type="number" min="-180" max="180" step="0.00001" value={longitude} onChange={event => setLongitude(Number(event.target.value))} /></label>
          <label className="research-field">AOI range [km]<input type="number" min="0.1" max="2500" step="0.1" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} /></label>
        </div>

        <div className="research-area-control">
          <div className="research-control-label"><span>Research-area shape</span><b>{researchShapeLabel(shape)} · {radiusKm} km</b></div>
          <div className="research-shape-buttons" role="group" aria-label="Research-area shape">
            {SHAPE_OPTIONS.map(option => <button key={option.id} type="button" className={shape === option.id ? 'active' : ''} onClick={() => setShape(option.id)}><span>{option.symbol}</span>{option.label}</button>)}
          </div>
          <label className="research-radius-slider">Area size
            <input type="range" min="1" max="500" step="1" value={Math.min(radiusKm, 500)} onChange={event => setRadiusKm(Number(event.target.value))} />
            <span><i>1 km</i><b>{radiusKm.toFixed(0)} km</b><i>500 km</i></span>
          </label>
        </div>

        <div className="research-temporal-control">
          <div className="research-control-label"><span>Observation-time selection</span><b>{temporalPresetLabel(temporalPreset)}</b></div>
          <div className="research-temporal-grid">
            <label className="research-field">Period<select value={temporalPreset} onChange={event => applyTemporalPreset(event.target.value as ResearchTemporalPreset)}>{TEMPORAL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label className="research-field">Year / decade year<input type="number" min="1972" max="2100" value={periodYear} onChange={event => updatePeriodYear(Number(event.target.value))} /></label>
            <label className="research-field">Exact date<input type="date" value={exactDate} onChange={event => updateExactDate(event.target.value)} /></label>
          </div>
          <div className="research-period-buttons" role="group" aria-label="Quick periods">
            {(['spring', 'summer', 'autumn', 'winter', 'year', 'decade'] as ResearchTemporalPreset[]).map(preset => <button type="button" key={preset} className={temporalPreset === preset ? 'active' : ''} onClick={() => applyTemporalPreset(preset)}>{temporalPresetLabel(preset)}</button>)}
          </div>
          <div className="research-coordinate-grid two">
            <label className="research-field">From<input type="date" value={startDate} onChange={event => { setTemporalPreset('custom'); setStartDate(event.target.value) }} /></label>
            <label className="research-field">To<input type="date" value={endDate} onChange={event => { setTemporalPreset('custom'); setEndDate(event.target.value) }} /></label>
          </div>
        </div>

        <div className="research-analysis-grid" role="group" aria-label="Analysis types">
          {ANALYSIS_OPTIONS.map(option => <label key={option.id} className={`research-analysis-option ${analyses.includes(option.id) ? 'selected' : ''}`}>
            <input type="checkbox" checked={analyses.includes(option.id)} onChange={() => toggleAnalysis(option.id)} />
            <span><b>{option.label}</b><small>{option.description}</small></span>
          </label>)}
        </div>

        <label className="research-field">Research note<textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="For example: inspect shoreline change, outlet continuity and terrain gradients…" /></label>

        {error && <p className="research-error" role="alert">{error}</p>}
        <div className="hero-actions research-actions">
          <button type="button" className="primary" onClick={prepareManifest}>Prepare and save study</button>
          <button type="button" className="secondary" onClick={onOpenArchive}>Open my archive</button>
        </div>

        {saved && <div className="research-saved" role="status">
          <div><b>Manifest saved:</b> {saved.id}</div>
          <span>{saved.area.latitude.toFixed(5)}°, {saved.area.longitude.toFixed(5)}° · {researchShapeLabel(saved.area.shape ?? 'circle')} · {saved.area.radius_km} km · {saved.temporal_scope.start_date} → {saved.temporal_scope.end_date}</span>
          <button type="button" onClick={() => downloadResearchManifest(saved)}>Export JSON</button>
        </div>}
      </div>

      <aside className="research-map-card panel">
        <div className="research-section-head"><div><small>MAPA HYDROLOGICZNA · RZEKI + WODY</small><h2>Znajdź miejsce i zaznacz obszar</h2></div><span className="evidence-badge observation">ZSYNCHRONIZOWANA Z „ZBADAJ TEREN”</span></div>
        <p className="muted">Po wyszukaniu miejsca wyżej ta mapa automatycznie przechodzi do tego samego punktu. Pokazuje przede wszystkim rzeki, cieki i jeziora. Kliknij mapę, aby zmienić środek AOI.</p>

        <div className="research-google-tools">
          <label className="research-field">Search Google Maps<input value={googleQuery} onChange={event => setGoogleQuery(event.target.value)} placeholder="e.g. Gniew, Vistula, Poland" /></label>
          <a className="button-link compact google-map-button" href={googleMapsSearchUrl(googleQuery || `${latitude},${longitude}`)} target="_blank" rel="noreferrer">Open Google Maps search</a>
          <label className="research-field">Paste a Google Maps link or coordinates<input value={googleLocation} onChange={event => setGoogleLocation(event.target.value)} placeholder="53.5914, 19.010717 or a Google Maps link" /></label>
          <button type="button" className="secondary" onClick={importGoogleLocation}>Set point from Google Maps</button>
        </div>

        <iframe
          className="research-hydrology-map"
          title={`Mapa hydrologiczna dla ${mapLabel}`}
          src={riverMapUrl}
          loading="lazy"
        />
        <div className="research-map-readout">
          <b>{formatCoordinate(latitude)}°, {formatCoordinate(longitude)}°</b>
          <span>{researchShapeLabel(shape)} · {radiusKm} km</span>
        </div>
        <p className="research-hydrology-note">Natural Earth + OpenStreetMap: główne rzeki i jeziora globalnie, a dla lokalnego AOI dodatkowo szczegółowe cieki OSM. Granice administracyjne są ograniczone, żeby nie zasłaniały hydrologii.</p>
        <a className="research-current-google-link" href={googleMapsCoordinateUrl(latitude, longitude)} target="_blank" rel="noreferrer">Show selected center in Google Maps ↗</a>
        <div className="research-map-presets">
          <button type="button" onClick={() => applyPreset('Kuchnia / Olszówka', 53.5914, 19.010717, 25)}>Kuchnia / Olszówka</button>
          <button type="button" onClick={() => applyPreset('Vistula Gniew–Grudziądz', 53.66, 18.79, 80)}>Vistula Gniew–Grudziądz</button>
          <button type="button" onClick={() => applyPreset('Himalayas / Tibet', 30.234961, 83.056124, 150)}>Himalayas / Tibet</button>
        </div>
      </aside>
    </div>

    <ResearchDataPreview
      latitude={latitude}
      longitude={longitude}
      radiusKm={radiusKm}
      shape={shape}
      startDate={startDate}
      endDate={endDate}
    />
  </section>
}
