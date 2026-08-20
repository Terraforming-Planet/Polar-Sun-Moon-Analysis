import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

import {
  buildResearchManifest,
  downloadResearchManifest,
  saveResearchManifestLocally,
  type ResearchAnalysisKind,
  type ResearchManifest,
} from './researchArchive'

const ANALYSIS_OPTIONS: Array<{ id: ResearchAnalysisKind; label: string; description: string }> = [
  { id: 'water-change', label: 'Zmiana powierzchni wody', description: 'porównanie linii brzegowej, zbiorników i mokradeł' },
  { id: 'hydrology', label: 'Hydrologia i przepływ', description: 'rzeki, kanały, rowy, dopływy, odpływy i kontekst wodny' },
  { id: 'terrain', label: 'Teren / DEM', description: 'wysokość, spadki, doliny, zlewnie i ukształtowanie terenu' },
  { id: 'hazards', label: 'Zagrożenia', description: 'pożary, powodzie i inne zarejestrowane źródła ostrzegawcze' },
  { id: 'multispectral', label: 'Analiza wielospektralna', description: 'porównanie oficjalnych produktów satelitarnych i sezonów' },
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
  const [startDate, setStartDate] = useState('1990-01-01')
  const [endDate, setEndDate] = useState('2026-12-31')
  const [analyses, setAnalyses] = useState<ResearchAnalysisKind[]>(['water-change', 'hydrology', 'terrain'])
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState<ResearchManifest | null>(null)
  const [error, setError] = useState('')

  const markerStyle = useMemo(() => ({
    left: `${((longitude + 180) / 360) * 100}%`,
    top: `${((90 - latitude) / 180) * 100}%`,
  }), [latitude, longitude])

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

  const prepareManifest = () => {
    try {
      const manifest = buildResearchManifest({ title, latitude, longitude, radiusKm, startDate, endDate, analyses, notes })
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
        <p className="muted">Ten formularz nie tworzy wyniku naukowego sam z siebie. Buduje kontrolowany manifest wejściowy dla pipeline'u Terra Observation: obszar, daty i rodzaje analiz.</p>

        <label className="research-field">Nazwa badania<input value={title} onChange={event => setTitle(event.target.value)} /></label>
        <div className="research-coordinate-grid">
          <label className="research-field">Szerokość geograficzna<input type="number" min="-90" max="90" step="0.00001" value={latitude} onChange={event => setLatitude(Number(event.target.value))} /></label>
          <label className="research-field">Długość geograficzna<input type="number" min="-180" max="180" step="0.00001" value={longitude} onChange={event => setLongitude(Number(event.target.value))} /></label>
          <label className="research-field">Promień badania [km]<input type="number" min="0.1" max="2500" step="0.1" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} /></label>
        </div>
        <div className="research-coordinate-grid two">
          <label className="research-field">Od<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
          <label className="research-field">Do<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
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
          <span>{saved.area.latitude.toFixed(5)}°, {saved.area.longitude.toFixed(5)}° · promień {saved.area.radius_km} km · {saved.temporal_scope.start_date} → {saved.temporal_scope.end_date}</span>
          <button type="button" onClick={() => downloadResearchManifest(saved)}>Eksportuj JSON</button>
        </div>}
      </div>

      <aside className="research-map-card panel">
        <div className="research-section-head"><div><small>GLOBAL AREA PICKER</small><h2>Wskaż punkt na świecie</h2></div></div>
        <p className="muted">Dotknij mapy współrzędnych albo wpisz dokładne wartości. Promień określa obszar badania wokół punktu.</p>
        <div className="research-world-picker" role="application" aria-label="Wybór współrzędnych na mapie świata" onClick={chooseFromMap}>
          <div className="research-world-grid" />
          <span className="world-label north">90°N</span><span className="world-label south">90°S</span>
          <span className="world-label west">180°W</span><span className="world-label east">180°E</span>
          <span className="world-label equator">0°</span>
          <span className="research-map-marker" style={markerStyle} aria-hidden="true"><i /></span>
        </div>
        <div className="research-map-readout">
          <b>{formatCoordinate(latitude)}°, {formatCoordinate(longitude)}°</b>
          <span>promień {radiusKm} km</span>
        </div>
        <div className="research-map-presets">
          <button type="button" onClick={() => { setLatitude(53.5914); setLongitude(19.010717); setRadiusKm(25) }}>Kuchnia / Olszówka</button>
          <button type="button" onClick={() => { setLatitude(53.66); setLongitude(18.79); setRadiusKm(80) }}>Wisła Gniew–Grudziądz</button>
          <button type="button" onClick={() => { setLatitude(30.234961); setLongitude(83.056124); setRadiusKm(150) }}>Himalaje / Tybet</button>
        </div>
      </aside>
    </div>
  </section>
}
