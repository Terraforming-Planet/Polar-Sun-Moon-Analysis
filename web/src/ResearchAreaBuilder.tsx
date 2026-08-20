import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

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
  { id: 'water-change', label: 'Zmiana powierzchni wody', description: 'porównanie linii brzegowej, zbiorników i mokradeł' },
  { id: 'hydrology', label: 'Hydrologia i przepływ', description: 'rzeki, kanały, rowy, dopływy, odpływy i kontekst wodny' },
  { id: 'terrain', label: 'Teren / DEM', description: 'wysokość, spadki, doliny, zlewnie i ukształtowanie terenu' },
  { id: 'hazards', label: 'Zagrożenia', description: 'pożary, powodzie i inne zarejestrowane źródła ostrzegawcze' },
  { id: 'multispectral', label: 'Analiza wielospektralna', description: 'porównanie oficjalnych produktów satelitarnych i sezonów' },
]

const SHAPE_OPTIONS: Array<{ id: ResearchAreaShape; label: string; symbol: string }> = [
  { id: 'circle', label: 'Koło', symbol: '○' },
  { id: 'square', label: 'Kwadrat', symbol: '□' },
  { id: 'triangle', label: 'Trójkąt', symbol: '△' },
]

const TEMPORAL_OPTIONS: Array<{ id: ResearchTemporalPreset; label: string }> = [
  { id: 'custom', label: 'Własny zakres' },
  { id: 'date', label: 'Dokładna data' },
  { id: 'spring', label: 'Wiosna' },
  { id: 'summer', label: 'Lato' },
  { id: 'autumn', label: 'Jesień' },
  { id: 'winter', label: 'Zima' },
  { id: 'year', label: 'Cały rok' },
  { id: 'decade', label: 'Dekada' },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function formatCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(5) : '0.00000'
}

export function ResearchAreaBuilder({ onOpenArchive }: { onOpenArchive: () => void }) {
  const [title, setTitle] = useState('Nowe badanie obszaru')
  const [latitude, setLatitude] = useState(53.5914)
  const [longitude, setLongitude] = useState(19.010717)
  const [radiusKm, setRadiusKm] = useState(25)
  const [shape, setShape] = useState<ResearchAreaShape>('circle')
  const [startDate, setStartDate] = useState('1990-01-01')
  const [endDate, setEndDate] = useState('2026-12-31')
  const [temporalPreset, setTemporalPreset] = useState<ResearchTemporalPreset>('custom')
  const [periodYear, setPeriodYear] = useState(2026)
  const [exactDate, setExactDate] = useState('2026-08-20')
  const [googleQuery, setGoogleQuery] = useState('Kuchnia Olszówka')
  const [googleLocation, setGoogleLocation] = useState('')
  const [analyses, setAnalyses] = useState<ResearchAnalysisKind[]>(['water-change', 'hydrology', 'terrain'])
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState<ResearchManifest | null>(null)
  const [error, setError] = useState('')

  const markerStyle = useMemo(() => ({
    left: `${((longitude + 180) / 360) * 100}%`,
    top: `${((90 - latitude) / 180) * 100}%`,
  }), [latitude, longitude])

  const areaOutlineStyle = useMemo(() => {
    const size = clamp(28 + Math.log10(Math.max(1, radiusKm)) * 24, 30, 105)
    return { ...markerStyle, width: `${size}px`, height: `${size}px` }
  }, [markerStyle, radiusKm])

  const toggleAnalysis = (kind: ResearchAnalysisKind) => {
    setAnalyses(current => current.includes(kind) ? current.filter(item => item !== kind) : [...current, kind])
  }

  const chooseFromMap = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    setLongitude(Number((x * 360 - 180).toFixed(5)))
    setLatitude(Number((90 - y * 180).toFixed(5)))
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
      setError('Nie udało się odczytać współrzędnych. Wklej link Google Maps zawierający współrzędne albo wpisz np. 53.5914, 19.010717.')
      return
    }
    setLatitude(Number(parsed.latitude.toFixed(6)))
    setLongitude(Number(parsed.longitude.toFixed(6)))
    setError('')
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

  return <section className="research-builder" aria-label="Kreator nowego badania obszaru">
    <div className="research-builder-grid">
      <div className="research-form panel">
        <div className="research-section-head">
          <div><small>NOWE BADANIE · AREA MANIFEST</small><h2>Wybierz obszar i przygotuj badanie</h2></div>
          <span className="evidence-badge observation">OFFICIAL / PUBLIC DATA ONLY</span>
        </div>
        <p className="muted">Wybierz miejsce, kształt i rozmiar AOI, a następnie okres obserwacji. Manifest pozostaje szkicem do czasu uruchomienia danych z oficjalnych źródeł.</p>

        <label className="research-field">Nazwa badania<input value={title} onChange={event => setTitle(event.target.value)} /></label>
        <div className="research-coordinate-grid">
          <label className="research-field">Szerokość geograficzna<input type="number" min="-90" max="90" step="0.00001" value={latitude} onChange={event => setLatitude(Number(event.target.value))} /></label>
          <label className="research-field">Długość geograficzna<input type="number" min="-180" max="180" step="0.00001" value={longitude} onChange={event => setLongitude(Number(event.target.value))} /></label>
          <label className="research-field">Zasięg AOI [km]<input type="number" min="0.1" max="2500" step="0.1" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} /></label>
        </div>

        <div className="research-area-control">
          <div className="research-control-label"><span>Kształt badanego obszaru</span><b>{researchShapeLabel(shape)} · {radiusKm} km</b></div>
          <div className="research-shape-buttons" role="group" aria-label="Kształt badanego obszaru">
            {SHAPE_OPTIONS.map(option => <button key={option.id} type="button" className={shape === option.id ? 'active' : ''} onClick={() => setShape(option.id)}><span>{option.symbol}</span>{option.label}</button>)}
          </div>
          <label className="research-radius-slider">Rozmiar obszaru
            <input type="range" min="1" max="500" step="1" value={Math.min(radiusKm, 500)} onChange={event => setRadiusKm(Number(event.target.value))} />
            <span><i>1 km</i><b>{radiusKm.toFixed(0)} km</b><i>500 km</i></span>
          </label>
        </div>

        <div className="research-temporal-control">
          <div className="research-control-label"><span>Wybór czasu obserwacji</span><b>{temporalPresetLabel(temporalPreset)}</b></div>
          <div className="research-temporal-grid">
            <label className="research-field">Okres<select value={temporalPreset} onChange={event => applyTemporalPreset(event.target.value as ResearchTemporalPreset)}>{TEMPORAL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label className="research-field">Rok / rok dekady<input type="number" min="1972" max="2100" value={periodYear} onChange={event => updatePeriodYear(Number(event.target.value))} /></label>
            <label className="research-field">Dokładna data<input type="date" value={exactDate} onChange={event => updateExactDate(event.target.value)} /></label>
          </div>
          <div className="research-period-buttons" role="group" aria-label="Szybkie okresy">
            {(['spring', 'summer', 'autumn', 'winter', 'year', 'decade'] as ResearchTemporalPreset[]).map(preset => <button type="button" key={preset} className={temporalPreset === preset ? 'active' : ''} onClick={() => applyTemporalPreset(preset)}>{temporalPresetLabel(preset)}</button>)}
          </div>
          <div className="research-coordinate-grid two">
            <label className="research-field">Od<input type="date" value={startDate} onChange={event => { setTemporalPreset('custom'); setStartDate(event.target.value) }} /></label>
            <label className="research-field">Do<input type="date" value={endDate} onChange={event => { setTemporalPreset('custom'); setEndDate(event.target.value) }} /></label>
          </div>
        </div>

        <div className="research-analysis-grid" role="group" aria-label="Rodzaje analizy">
          {ANALYSIS_OPTIONS.map(option => <label key={option.id} className={`research-analysis-option ${analyses.includes(option.id) ? 'selected' : ''}`}>
            <input type="checkbox" checked={analyses.includes(option.id)} onChange={() => toggleAnalysis(option.id)} />
            <span><b>{option.label}</b><small>{option.description}</small></span>
          </label>)}
        </div>

        <label className="research-field">Notatka badawcza<textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Np. sprawdzić zmianę linii brzegowej, drożność odpływów, ukształtowanie terenu…" /></label>

        {error && <p className="research-error" role="alert">{error}</p>}
        <div className="hero-actions research-actions">
          <button type="button" className="primary" onClick={prepareManifest}>Przygotuj i zapisz badanie</button>
          <button type="button" className="secondary" onClick={onOpenArchive}>Otwórz moje archiwum</button>
        </div>

        {saved && <div className="research-saved" role="status">
          <div><b>Zapisano manifest:</b> {saved.id}</div>
          <span>{saved.area.latitude.toFixed(5)}°, {saved.area.longitude.toFixed(5)}° · {researchShapeLabel(saved.area.shape ?? 'circle')} · {saved.area.radius_km} km · {saved.temporal_scope.start_date} → {saved.temporal_scope.end_date}</span>
          <button type="button" onClick={() => downloadResearchManifest(saved)}>Eksportuj JSON</button>
        </div>}
      </div>

      <aside className="research-map-card panel">
        <div className="research-section-head"><div><small>GOOGLE MAPS + GLOBAL AREA PICKER</small><h2>Znajdź miejsce i zaznacz obszar</h2></div></div>
        <p className="muted">Najpierw możesz wyszukać miejsce w Google Maps, a potem wkleić współrzędne lub link. Na mapie projektu ustawiasz środek AOI dotknięciem.</p>

        <div className="research-google-tools">
          <label className="research-field">Szukaj miejsca w Google Maps<input value={googleQuery} onChange={event => setGoogleQuery(event.target.value)} placeholder="np. Gniew, Wisła, Polska" /></label>
          <a className="button-link compact google-map-button" href={googleMapsSearchUrl(googleQuery || `${latitude},${longitude}`)} target="_blank" rel="noreferrer">Otwórz wyszukiwanie Google Maps</a>
          <label className="research-field">Wklej link Google Maps lub współrzędne<input value={googleLocation} onChange={event => setGoogleLocation(event.target.value)} placeholder="53.5914, 19.010717 lub link z Google Maps" /></label>
          <button type="button" className="secondary" onClick={importGoogleLocation}>Ustaw punkt z Google Maps</button>
        </div>

        <div className="research-world-picker" role="application" aria-label="Wybór współrzędnych na mapie świata" onClick={chooseFromMap}>
          <div className="research-world-grid" />
          <span className="world-label north">90°N</span><span className="world-label south">90°S</span>
          <span className="world-label west">180°W</span><span className="world-label east">180°E</span>
          <span className="world-label equator">0°</span>
          <span className={`research-area-outline ${shape}`} style={areaOutlineStyle} aria-hidden="true" />
          <span className="research-map-marker" style={markerStyle} aria-hidden="true"><i /></span>
        </div>
        <div className="research-map-readout">
          <b>{formatCoordinate(latitude)}°, {formatCoordinate(longitude)}°</b>
          <span>{researchShapeLabel(shape)} · {radiusKm} km</span>
        </div>
        <a className="research-current-google-link" href={googleMapsCoordinateUrl(latitude, longitude)} target="_blank" rel="noreferrer">Pokaż wybrany środek w Google Maps ↗</a>
        <div className="research-map-presets">
          <button type="button" onClick={() => { setLatitude(53.5914); setLongitude(19.010717); setRadiusKm(25) }}>Kuchnia / Olszówka</button>
          <button type="button" onClick={() => { setLatitude(53.66); setLongitude(18.79); setRadiusKm(80) }}>Wisła Gniew–Grudziądz</button>
          <button type="button" onClick={() => { setLatitude(30.234961); setLongitude(83.056124); setRadiusKm(150) }}>Himalaje / Tybet</button>
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
