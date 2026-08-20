import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'

import { RealisticEarthGlobe } from './RealisticEarthGlobe'
import { fetchResearchElevations, type ElevationDataset, type ElevationPoint } from './lib/evidenceApi'
import './research-terrain-lab.css'

export type ResearchLabPlace = {
  label: string
  latitude: number
  longitude: number
}

type Flag = {
  id: string
  number: number
  latitude: number
  longitude: number
  label: string
  color: string
  elevation?: ElevationPoint
}

type DrawPoint = { latitude: number; longitude: number }
type DrawPath = { id: string; color: string; points: DrawPoint[] }
type Tool = 'flag' | 'line'
type ImagerySource = 'sentinel2' | 'viirs' | 'modis'
type ImageQuality = 1024 | 2048

type Profile = {
  pathId: string
  color: string
  points: ElevationPoint[]
  dataset: ElevationDataset
}

const STORAGE_KEY = 'terra-research-terrain-lab/v1'
const DRAW_COLORS = ['#ff2c2c', '#ffd91a', '#1dea50', '#245dff', '#ff20df', '#ffffff', '#121820']
const CDSE_INSTANCE = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${CDSE_INSTANCE}`
const CDSE_TRUE_COLOR_LAYER = import.meta.env.VITE_CDSE_TRUE_COLOR_LAYER || import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR'

const NILE_REFERENCE_FLAGS: Array<Omit<Flag, 'id' | 'number' | 'elevation'>> = [
  { latitude: 12.0, longitude: 37.25, label: 'Jezioro Tana — punkt referencyjny źródłowego obszaru Nilu Błękitnego', color: '#2ca8ff' },
  { latitude: 11.55, longitude: 37.6, label: 'Wyżyna Etiopska — punkt referencyjny zlewni górnego Nilu Błękitnego', color: '#2ca8ff' },
  { latitude: 15.6031, longitude: 32.5265, label: 'Chartum — rejon połączenia Nilu Białego i Błękitnego', color: '#f4c64e' },
]

function boundsForMap(place: ResearchLabPlace, radiusKm = 25) {
  const latDelta = Math.max(0.08, radiusKm / 111.32)
  const lonScale = Math.max(0.2, Math.cos(place.latitude * Math.PI / 180))
  const lonDelta = Math.max(0.08, radiusKm / (111.32 * lonScale))
  return {
    west: Math.max(-180, place.longitude - lonDelta),
    south: Math.max(-90, place.latitude - latDelta),
    east: Math.min(180, place.longitude + lonDelta),
    north: Math.min(90, place.latitude + latDelta),
  }
}

function dateDaysBefore(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return date
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

function gibsUrl(place: ResearchLabPlace, date: string, layer: string, size: number, radiusKm = 25) {
  const bounds = boundsForMap(place, radiusKm)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: layer,
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: String(size),
    HEIGHT: String(size),
    TIME: date,
  })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`
}

function copernicusUrl(place: ResearchLabPlace, date: string, size: number, radiusKm = 25) {
  const bounds = boundsForMap(place, radiusKm)
  const start = dateDaysBefore(date, 14)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: CDSE_TRUE_COLOR_LAYER,
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    SRS: 'EPSG:4326',
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    WIDTH: String(size),
    HEIGHT: String(size),
    TIME: `${start}/${date}`,
    MAXCC: '35',
    SHOWLOGO: 'false',
  })
  return `${CDSE_WMS}?${params.toString()}`
}

function imageryUrl(source: ImagerySource, place: ResearchLabPlace, date: string, size: number) {
  if (source === 'sentinel2') return copernicusUrl(place, date, size)
  if (source === 'modis') return gibsUrl(place, date, 'MODIS_Terra_CorrectedReflectance_TrueColor', size)
  return gibsUrl(place, date, 'VIIRS_SNPP_CorrectedReflectance_TrueColor', size)
}

function sourceLabel(source: ImagerySource) {
  if (source === 'sentinel2') return 'Copernicus Sentinel-2 L2A · true colour · 10 m bands where available'
  if (source === 'modis') return 'NASA GIBS · Terra MODIS Corrected Reflectance · historical continuity'
  return 'NASA GIBS · Suomi NPP VIIRS Corrected Reflectance · recent daily global imagery'
}

function sourceLimit(source: ImagerySource, date: string) {
  if (source === 'sentinel2') return `WMS searches the ${dateDaysBefore(date, 14)} → ${date} window with cloud limit 35%; optical coverage depends on revisit and clouds.`
  if (source === 'modis') return 'MODIS is lower spatial resolution than Sentinel-2 but provides a long daily record useful for historical comparison.'
  return 'VIIRS is a daily global visualization; it is much coarser than Sentinel-2 and should not be treated as 10 m imagery.'
}

function yesterdayUtc() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function flagPosition(flag: DrawPoint, bounds: ReturnType<typeof boundsForMap>) {
  return {
    left: `${((flag.longitude - bounds.west) / Math.max(1e-9, bounds.east - bounds.west)) * 100}%`,
    top: `${((bounds.north - flag.latitude) / Math.max(1e-9, bounds.north - bounds.south)) * 100}%`,
  }
}

function pointFromClick(event: ReactMouseEvent<HTMLDivElement>, bounds: ReturnType<typeof boundsForMap>) {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  return {
    longitude: bounds.west + x * (bounds.east - bounds.west),
    latitude: bounds.north - y * (bounds.north - bounds.south),
  }
}

function haversineKm(a: DrawPoint, b: DrawPoint) {
  const r = 6371.0088
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

function samplePath(points: DrawPoint[], count = 20) {
  if (points.length < 2) return []
  const lengths = points.slice(1).map((point, index) => haversineKm(points[index], point))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []
  const samples: DrawPoint[] = []
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const target = (total * sampleIndex) / (count - 1)
    let travelled = 0
    let segmentIndex = 0
    while (segmentIndex < lengths.length - 1 && travelled + lengths[segmentIndex] < target) {
      travelled += lengths[segmentIndex]
      segmentIndex += 1
    }
    const segmentLength = Math.max(1e-9, lengths[segmentIndex])
    const fraction = Math.min(1, Math.max(0, (target - travelled) / segmentLength))
    const start = points[segmentIndex]
    const end = points[segmentIndex + 1]
    samples.push({
      latitude: start.latitude + (end.latitude - start.latitude) * fraction,
      longitude: start.longitude + (end.longitude - start.longitude) * fraction,
    })
  }
  return samples
}

function profilePolyline(points: ElevationPoint[]) {
  if (!points.length) return ''
  const values = points.map(point => point.elevation_m)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  return points.map((point, index) => {
    const x = 24 + (index / Math.max(1, points.length - 1)) * 672
    const y = 180 - ((point.elevation_m - min) / range) * 140
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function ResearchTerrainLab({ apiUrl, place, satelliteDate }: {
  apiUrl: string
  place: ResearchLabPlace
  satelliteDate?: string
}) {
  const [tool, setTool] = useState<Tool>('flag')
  const [color, setColor] = useState(DRAW_COLORS[0])
  const [flags, setFlags] = useState<Flag[]>([])
  const [paths, setPaths] = useState<DrawPath[]>([])
  const [activePath, setActivePath] = useState<DrawPoint[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState('')
  const [imagerySource, setImagerySource] = useState<ImagerySource>('sentinel2')
  const [quality, setQuality] = useState<ImageQuality>(() => typeof window !== 'undefined' && window.innerWidth <= 700 ? 1024 : 2048)
  const date = satelliteDate ?? yesterdayUtc()
  const bounds = useMemo(() => boundsForMap(place, 25), [place])
  const mapUrl = useMemo(() => imageryUrl(imagerySource, place, date, quality), [imagerySource, place, date, quality])
  const fullUrl = useMemo(() => imageryUrl(imagerySource, place, date, 4096), [imagerySource, place, date])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { flags?: Flag[]; paths?: DrawPath[] }
      if (Array.isArray(saved.flags)) setFlags(saved.flags)
      if (Array.isArray(saved.paths)) setPaths(saved.paths)
    } catch {
      // Corrupt local drafts are ignored; official measurements are always refetched on demand.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ flags, paths }))
  }, [flags, paths])

  const addFlag = async (point: DrawPoint, label = '') => {
    const number = flags.reduce((max, item) => Math.max(max, item.number), 0) + 1
    const provisional: Flag = {
      id: crypto.randomUUID(),
      number,
      latitude: point.latitude,
      longitude: point.longitude,
      label: label || `Punkt ${number}`,
      color,
    }
    setFlags(current => [...current, provisional])
    setStatus(`Pobieram wysokość dla flagi ${number}…`)
    try {
      const response = await fetchResearchElevations(apiUrl, [{ ...point, label: provisional.label }])
      setFlags(current => current.map(item => item.id === provisional.id ? { ...item, elevation: response.points[0] } : item))
      setStatus(`Flaga ${number}: ${Math.round(response.points[0].elevation_m)} m n.p.m. · ${response.dataset.name}`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const handleMapClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const point = pointFromClick(event, bounds)
    if (tool === 'flag') void addFlag(point)
    else setActivePath(current => [...current, point])
  }

  const finishPath = () => {
    if (activePath.length < 2) {
      setStatus('Linia wymaga co najmniej dwóch punktów.')
      return
    }
    const path: DrawPath = { id: crypto.randomUUID(), color, points: activePath }
    setPaths(current => [...current, path])
    setActivePath([])
    setStatus('Linia zapisana. Możesz wygenerować profil 20 pomiarów DEM.')
  }

  const buildProfile = async (path: DrawPath) => {
    const samples = samplePath(path.points, 20)
    if (!samples.length) return
    setStatus('Pobieram 20 próbek DEM wzdłuż linii…')
    try {
      const response = await fetchResearchElevations(apiUrl, samples.map((point, index) => ({ ...point, label: `Profil ${index + 1}` })))
      setProfile({ pathId: path.id, color: path.color, points: response.points, dataset: response.dataset })
      setStatus(`Profil gotowy: 20 próbek · ${response.dataset.name} · nominalnie ${response.dataset.nominal_horizontal_resolution_m} m.`)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const addNileReferences = async () => {
    const nextNumber = flags.reduce((max, item) => Math.max(max, item.number), 0) + 1
    setStatus('Dodaję trzy referencyjne punkty Nilu i pobieram ich wysokości DEM…')
    try {
      const response = await fetchResearchElevations(apiUrl, NILE_REFERENCE_FLAGS.map(item => ({
        latitude: item.latitude,
        longitude: item.longitude,
        label: item.label,
      })))
      const additions = NILE_REFERENCE_FLAGS.map((item, index): Flag => ({
        id: crypto.randomUUID(),
        number: nextNumber + index,
        ...item,
        elevation: response.points[index],
      }))
      setFlags(current => [...current, ...additions])
      setStatus('Dodano trzy punkty Nilu. Wysokości pochodzą z DEM; położenia są jawnie opisane jako punkty referencyjne.')
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const localFlags = flags.filter(flag => flag.longitude >= bounds.west && flag.longitude <= bounds.east && flag.latitude >= bounds.south && flag.latitude <= bounds.north)
  const globeMarkers = flags.map(flag => ({ longitude: flag.longitude, latitude: flag.latitude, color: flag.color === '#2ca8ff' ? 0x2ca8ff : 0xff2c2c, radius: 1.25 }))
  const visiblePaths = paths.filter(path => path.points.some(point => point.longitude >= bounds.west && point.longitude <= bounds.east && point.latitude >= bounds.south && point.latitude <= bounds.north))

  return <section className="terrain-lab panel" aria-label="Laboratorium wysokości i oznaczeń terenu">
    <div className="terrain-lab-head">
      <div><small>ADVANCED · DEM · FLAGI · PROFILE · HIGH-QUALITY IMAGERY</small><h2>Laboratorium terenu</h2></div>
      <span className="evidence-badge observation">PROVENANCE VISIBLE</span>
    </div>
    <p className="muted">Tutaj są narzędzia techniczne. Mapa używa kwadratowego obrazu bez rozciągania proporcji. Domyślnie próbuje Copernicus Sentinel-2; możesz przełączyć na stabilne globalne warstwy NASA VIIRS/MODIS. Wysokości DEM nie są zgadywane.</p>

    <div className="terrain-imagery-controls">
      <div className="terrain-source-buttons" role="group" aria-label="Źródło obrazu satelitarnego">
        <button type="button" className={imagerySource === 'sentinel2' ? 'active' : ''} onClick={() => setImagerySource('sentinel2')}>Copernicus Sentinel-2 · najwyższa szczegółowość</button>
        <button type="button" className={imagerySource === 'viirs' ? 'active' : ''} onClick={() => setImagerySource('viirs')}>NASA VIIRS · najnowszy globalny</button>
        <button type="button" className={imagerySource === 'modis' ? 'active' : ''} onClick={() => setImagerySource('modis')}>NASA MODIS · historia</button>
      </div>
      <label>Rozmiar obrazu<select value={quality} onChange={event => setQuality(Number(event.target.value) as ImageQuality)}><option value={1024}>1024 × 1024 · szybciej</option><option value={2048}>2048 × 2048 · dokładniej</option></select></label>
      <a className="button-link compact" href={fullUrl} target="_blank" rel="noreferrer">Otwórz 4096 × 4096</a>
    </div>
    <div className="terrain-source-note"><b>{sourceLabel(imagerySource)}</b><span>{sourceLimit(imagerySource, date)}</span></div>

    <div className="terrain-lab-toolbar">
      <button type="button" className={tool === 'flag' ? 'active' : ''} onClick={() => setTool('flag')}>⚑ Flaga + wysokość</button>
      <button type="button" className={tool === 'line' ? 'active' : ''} onClick={() => setTool('line')}>✎ Rysuj linię</button>
      {tool === 'line' && <button type="button" onClick={finishPath} disabled={activePath.length < 2}>Zakończ linię ({activePath.length})</button>}
      <button type="button" onClick={() => void addNileReferences()}>Dodaj 3 punkty Nilu</button>
      <button type="button" onClick={() => { setFlags([]); setPaths([]); setActivePath([]); setProfile(null); setStatus('Wyczyszczono lokalne oznaczenia.') }}>Wyczyść</button>
      <div className="terrain-colors" aria-label="Kolor oznaczeń">{DRAW_COLORS.map(value => <button key={value} type="button" className={color === value ? 'selected' : ''} style={{ background: value }} aria-label={`Kolor ${value}`} onClick={() => setColor(value)} />)}</div>
    </div>

    <div className="terrain-map-wrap">
      <div className="terrain-map" role="application" aria-label="Mapa satelitarna do dodawania flag" onClick={handleMapClick}>
        <img
          key={mapUrl}
          src={mapUrl}
          alt={`${sourceLabel(imagerySource)} · ${place.label} · ${date}`}
          draggable={false}
          loading="eager"
          decoding="async"
          onError={() => {
            if (imagerySource === 'sentinel2') {
              setImagerySource('viirs')
              setStatus('Copernicus WMS nie zwrócił obrazu dla tego zapytania. Automatycznie przełączono na NASA VIIRS.')
            } else {
              setStatus('Wybrane źródło obrazu chwilowo nie zwróciło poprawnej warstwy. Spróbuj innego źródła lub daty.')
            }
          }}
        />
        <svg className="terrain-path-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {visiblePaths.map(path => <polyline key={path.id} points={path.points.map(point => {
            const x = ((point.longitude - bounds.west) / (bounds.east - bounds.west)) * 1000
            const y = ((bounds.north - point.latitude) / (bounds.north - bounds.south)) * 1000
            return `${x},${y}`
          }).join(' ')} fill="none" stroke={path.color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />)}
          {activePath.length > 0 && <polyline points={activePath.map(point => {
            const x = ((point.longitude - bounds.west) / (bounds.east - bounds.west)) * 1000
            const y = ((bounds.north - point.latitude) / (bounds.north - bounds.south)) * 1000
            return `${x},${y}`
          }).join(' ')} fill="none" stroke={color} strokeWidth="7" strokeDasharray="12 8" strokeLinecap="round" />}
        </svg>
        {localFlags.map(flag => <button key={flag.id} type="button" className="terrain-flag" style={{ ...flagPosition(flag, bounds), '--flag-color': flag.color } as React.CSSProperties} title={`${flag.label}${flag.elevation ? ` · ${Math.round(flag.elevation.elevation_m)} m n.p.m.` : ''}`} onClick={event => event.stopPropagation()}><span>{flag.number}</span></button>)}
      </div>
      <div className="terrain-map-meta"><b>{sourceLabel(imagerySource)} · request end {date} · {quality} px</b><span>AOI podglądu: 25 km · WGS84 · linie/flag są adnotacją użytkownika. Obraz optyczny nie jest „live video”; pokazujemy najnowszą dostępną warstwę dla wybranego okresu.</span></div>
    </div>

    <details className="terrain-globe-preview">
      <summary><b>🌍 Otwórz techniczny globus 3D</b><span>obracaj, oddalaj i przełączaj oficjalne warstwy NASA / Copernicus</span></summary>
      <RealisticEarthGlobe selectedTime={`${date}T12:00:00Z`} markers={globeMarkers.length ? globeMarkers : [{ longitude: place.longitude, latitude: place.latitude, color: 0x35cfff, radius: 1.3 }]} />
    </details>

    {status && <p className="terrain-status" role="status">{status}</p>}

    <div className="terrain-flags-table">
      <div className="terrain-section-title"><h3>Flagi pomiarowe ({flags.length})</h3><small>kliknięte punkty + jawne źródło wysokości</small></div>
      {flags.length ? <div className="terrain-table-scroll"><table><thead><tr><th>#</th><th>Nazwa</th><th>WGS84</th><th>Wysokość</th><th>Źródło / ograniczenie</th></tr></thead><tbody>{flags.map(flag => <tr key={flag.id}><td><span className="table-flag" style={{ background: flag.color }}>{flag.number}</span></td><td>{flag.label}</td><td>{flag.latitude.toFixed(5)}, {flag.longitude.toFixed(5)}</td><td>{flag.elevation ? `${Math.round(flag.elevation.elevation_m)} m` : 'pobieranie / brak'}</td><td>{flag.elevation ? `Copernicus DEM GLO-90 · ${flag.elevation.sample_method} · komórka ~${flag.elevation.nominal_cell_size_m} m` : '—'}</td></tr>)}</tbody></table></div> : <p className="muted">Nie dodano jeszcze flag.</p>}
    </div>

    {paths.length > 0 && <div className="terrain-profiles-list">
      <div className="terrain-section-title"><h3>Narysowane linie ({paths.length})</h3><small>z każdej możesz pobrać 20 próbek DEM</small></div>
      {paths.map((path, index) => <button type="button" key={path.id} onClick={() => void buildProfile(path)}><i style={{ background: path.color }} />Linia {index + 1} · {path.points.length} węzłów → profil 20 punktów</button>)}
    </div>}

    {profile && <section className="terrain-profile">
      <div className="terrain-section-title"><h3>Profil wysokości — 20 próbek</h3><small>{profile.dataset.name} · nominalna rozdzielczość {profile.dataset.nominal_horizontal_resolution_m} m</small></div>
      <svg viewBox="0 0 720 210" role="img" aria-label="Wykres wysokości terenu"><line x1="24" y1="180" x2="696" y2="180" stroke="currentColor" opacity=".35"/><polyline points={profilePolyline(profile.points)} fill="none" stroke={profile.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{profile.points.map((point, index) => {
        const values = profile.points.map(item => item.elevation_m)
        const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(1, max - min)
        const x = 24 + (index / Math.max(1, profile.points.length - 1)) * 672
        const y = 180 - ((point.elevation_m - min) / range) * 140
        return <circle key={`${point.latitude}-${point.longitude}-${index}`} cx={x} cy={y} r="4" fill={profile.color}><title>{index + 1}: {Math.round(point.elevation_m)} m</title></circle>
      })}</svg>
      <div className="terrain-profile-stats"><span>min <b>{Math.round(Math.min(...profile.points.map(point => point.elevation_m)))} m</b></span><span>max <b>{Math.round(Math.max(...profile.points.map(point => point.elevation_m)))} m</b></span><span>próbek <b>{profile.points.length}</b></span></div>
      <p className="muted">Profil pokazuje próbki rastra DEM. Między punktami nie wykonujemy sztucznego „dokładnego” pomiaru. Przy stromych zboczach rzeczywista wysokość może zmieniać się istotnie wewnątrz jednej komórki.</p>
    </section>}
  </section>
}
