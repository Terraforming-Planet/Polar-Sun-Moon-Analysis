import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './styles.css'
import './control-center.css'

type Tab = 'control' | 'earth' | 'floods' | 'fires' | 'water' | 'north' | 'south' | 'solar' | 'sources'
type EvidenceClass = 'observation' | 'derived' | 'estimate' | 'hypothesis' | 'unknown'
type Body = { body: string; position_au: [number, number, number]; source: string }
type SolarData = { timestamp_utc: string; scale_note: string; bodies: Body[] }
type HazardFeature = {
  geometry: { type: string; coordinates: number[] | number[][][] }
  properties: { title?: string; categories?: string[]; observation_time?: string; source_url?: string }
}
type HazardData = { generated_at_utc: string; notice: string; features: HazardFeature[] }
type Source = { id: string; agency: string; mission: string; instrument: string; temporal_coverage: string; spatial_resolution: string; access: string; url: string; limitations: string }
type PolarRow = {
  year: number; season: string; pole: string; body: string; timestamp_utc: string
  apparent_altitude_deg: number; declination_deg: number; source_url?: string; quality_flag?: string
}
type CopernicusData = { metadata?: { data_poczatkowa?: string; data_koncowa?: string; run_at_utc?: string }; observations?: unknown[] }
type FloodMeta = { before_period?: string[]; after_period?: string[]; generated_at_utc?: string; evidence_class?: string; run_metadata?: Record<string, unknown> }
type Speed = 'hour' | 'day' | 'month' | 'year'

const base = import.meta.env.BASE_URL
const isoInput = (value: string) => value ? new Date(value).toISOString().slice(0, 16) : ''
const formatUtc = (value?: string) => value ? new Date(value).toLocaleString('pl-PL', { timeZone: 'UTC' }) + ' UTC' : 'brak danych'
const hoursBetween = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000

function useJson<T>(path: string): [T | null, string | null] {
  const [value, setValue] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${base}${path}`).then(response => {
      if (!response.ok) throw new Error(`${response.status} ${path}`)
      return response.json() as Promise<T>
    }).then(setValue).catch(reason => setError(String(reason)))
  }, [path])
  return [value, error]
}

function EvidenceBadge({ kind, children }: { kind: EvidenceClass; children?: React.ReactNode }) {
  return <span className={`evidence-badge ${kind}`}>{children ?? kind.toUpperCase()}</span>
}

function nearestTimestamp(requested: string, timestamps: string[]) {
  if (!timestamps.length) return requested
  const target = new Date(requested).getTime()
  return timestamps.reduce((best, current) => Math.abs(new Date(current).getTime() - target) < Math.abs(new Date(best).getTime() - target) ? current : best)
}

function stepDate(value: string, speed: Speed, direction = 1) {
  const date = new Date(value)
  if (speed === 'hour') date.setUTCHours(date.getUTCHours() + direction)
  if (speed === 'day') date.setUTCDate(date.getUTCDate() + direction)
  if (speed === 'month') date.setUTCMonth(date.getUTCMonth() + direction)
  if (speed === 'year') date.setUTCFullYear(date.getUTCFullYear() + direction)
  return date.toISOString()
}

function TimeController({ requested, selected, timestamps, playing, speed, onRequested, onPlaying, onSpeed }: {
  requested: string; selected: string; timestamps: string[]; playing: boolean; speed: Speed
  onRequested: (value: string) => void; onPlaying: (value: boolean) => void; onSpeed: (value: Speed) => void
}) {
  const sorted = [...timestamps].sort()
  const index = Math.max(0, sorted.indexOf(selected))
  const move = (direction: number) => {
    if (!sorted.length) return
    const next = Math.max(0, Math.min(sorted.length - 1, index + direction))
    onRequested(sorted[next])
  }
  const age = selected ? hoursBetween(selected, new Date().toISOString()) : 0
  return <section className="time-controller" aria-label="Globalne sterowanie czasem UTC" onKeyDown={event => {
    if (event.key === 'ArrowLeft') move(-1)
    if (event.key === 'ArrowRight') move(1)
    if (event.key === ' ') { event.preventDefault(); onPlaying(!playing) }
  }} tabIndex={0}>
    <div className="time-head"><div><small>GLOBAL UTC TIMELINE</small><h2>Sterowanie czasem obserwacji</h2></div><EvidenceBadge kind="observation">NAJBLIŻSZA DOSTĘPNA OBSERWACJA</EvidenceBadge></div>
    <div className="time-controls">
      <label>Żądany czas UTC<input aria-label="Żądana data i godzina UTC" type="datetime-local" value={isoInput(requested)} onChange={event => onRequested(new Date(`${event.target.value}:00Z`).toISOString())}/></label>
      <button onClick={() => move(-1)} aria-label="Poprzednia dostępna obserwacja">◀ Poprzednia</button>
      <button className="primary" onClick={() => onPlaying(!playing)} aria-label={playing ? 'Pauza' : 'Odtwarzaj'}>{playing ? 'Ⅱ Pauza' : '▶ Odtwarzaj'}</button>
      <button onClick={() => move(1)} aria-label="Następna dostępna obserwacja">Następna ▶</button>
      <button onClick={() => sorted.length && onRequested(sorted.at(-1)!)}>TERAZ / najnowsze dane</button>
      <label>Krok<select value={speed} onChange={event => onSpeed(event.target.value as Speed)}><option value="hour">1 godzina</option><option value="day">1 dzień</option><option value="month">1 miesiąc</option><option value="year">1 rok</option></select></label>
    </div>
    <div className="time-status">
      <span><b>Żądany:</b> {formatUtc(requested)}</span><span><b>Wybrana obserwacja:</b> {formatUtc(selected)}</span><span><b>Różnica:</b> {hoursBetween(requested, selected).toFixed(1)} h</span><span><b>Wiek danych:</b> {age.toFixed(1)} h</span>
      <span><b>Zakres:</b> {formatUtc(sorted[0])} — {formatUtc(sorted.at(-1))}</span>
    </div>
  </section>
}

function featurePoint(feature: HazardFeature): [number, number] | null {
  if (feature.geometry.type === 'Point') return feature.geometry.coordinates as [number, number]
  const polygon = feature.geometry.coordinates as number[][][]
  if (!polygon[0]?.length) return null
  const sum = polygon[0].reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / polygon[0].length, sum[1] / polygon[0].length]
}

function EarthGlobe({ data, selectedTime }: { data: HazardData; selectedTime: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.set(0, 0, 8.2)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 4.3; controls.maxDistance = 14
    const globe = new THREE.Group(); scene.add(globe)
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(2.65, 64, 64), new THREE.MeshStandardMaterial({ color: 0x08375c, roughness: .85 })))
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(2.69, 36, 24), new THREE.MeshBasicMaterial({ color: 0x3fa9e8, wireframe: true, transparent: true, opacity: .15 })))
    scene.add(new THREE.AmbientLight(0x8ac8ff, 1.7)); const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(5, 3, 5); scene.add(light)
    const selectedMs = new Date(selectedTime).getTime()
    data.features.filter(feature => {
      const time = feature.properties.observation_time
      return !time || new Date(time).getTime() <= selectedMs
    }).slice(0, 300).forEach(feature => {
      const point = featurePoint(feature); if (!point) return
      const [lon, lat] = point; const phi = (90 - lat) * Math.PI / 180; const theta = (lon + 180) * Math.PI / 180; const r = 2.72
      const marker = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff744f }))
      marker.position.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)); globe.add(marker)
    })
    let frame = 0; const resize = () => { if (!host.current) return; renderer.setSize(host.current.clientWidth, host.current.clientHeight, false); camera.aspect = host.current.clientWidth / host.current.clientHeight; camera.updateProjectionMatrix() }
    const animate = () => { frame = requestAnimationFrame(animate); globe.rotation.y += .0007; controls.update(); renderer.render(scene, camera) }
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize(); animate()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); host.current?.replaceChildren() }
  }, [data, selectedTime])
  return <div className="globe-canvas" ref={host} aria-label="Interaktywny globus 3D zdarzeń NASA EONET według wybranego czasu"/>
}

function PolarObservatory({ rows, pole, requested }: { rows: PolarRow[]; pole: 'North Pole' | 'South Pole'; requested: string }) {
  const [body, setBody] = useState<'Sun' | 'Moon'>('Moon')
  const [year, setYear] = useState(2024); const [season, setSeason] = useState('vernal')
  const candidates = rows.filter(row => row.pole === pole && row.body === body)
  const exact = candidates.find(row => row.year === year && row.season === season)
  const chosen = exact ?? candidates.reduce<PolarRow | null>((best, row) => !best || hoursBetween(requested, row.timestamp_utc) < hoursBetween(requested, best.timestamp_utc) ? row : best, null)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current || !chosen) return
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(48, 1, .1, 100); camera.position.set(5.5, 4.5, 7)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true
    const earth = new THREE.Mesh(new THREE.SphereGeometry(2, 48, 48), new THREE.MeshStandardMaterial({ color: 0x135a8c, roughness: .8 })); scene.add(earth)
    scene.add(new THREE.AxesHelper(3.3)); scene.add(new THREE.AmbientLight(0x9dcfff, 1.8)); const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(4, 5, 4); scene.add(light)
    const y = pole === 'North Pole' ? 2.05 : -2.05
    const observer = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 16), new THREE.MeshBasicMaterial({ color: 0x74ffb8 })); observer.position.set(0, y, 0); scene.add(observer)
    const horizon = new THREE.Mesh(new THREE.CircleGeometry(2.5, 64), new THREE.MeshBasicMaterial({ color: 0x31cfff, transparent: true, opacity: .13, side: THREE.DoubleSide })); horizon.rotation.x = Math.PI / 2; horizon.position.y = y; scene.add(horizon)
    const altitude = chosen.apparent_altitude_deg * Math.PI / 180; const sign = pole === 'North Pole' ? 1 : -1
    const direction = new THREE.Vector3(Math.cos(altitude) * 3.4, y + sign * Math.sin(altitude) * 3.4, 0)
    const arrow = new THREE.ArrowHelper(direction.clone().sub(observer.position).normalize(), observer.position, 3.4, body === 'Sun' ? 0xffd45c : 0xd6e3ff, .35, .18); scene.add(arrow)
    let frame = 0; const resize = () => { if (!host.current) return; renderer.setSize(host.current.clientWidth, host.current.clientHeight, false); camera.aspect = host.current.clientWidth / host.current.clientHeight; camera.updateProjectionMatrix() }
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera) }; const ro = new ResizeObserver(resize); ro.observe(host.current); resize(); animate()
    return () => { cancelAnimationFrame(frame); ro.disconnect(); controls.dispose(); renderer.dispose(); host.current?.replaceChildren() }
  }, [chosen, pole, body])
  const years = [...new Set(candidates.map(row => row.year))].sort((a, b) => a - b)
  return <section className="workspace"><div className="workspace-head"><div><small>NASA JPL HORIZONS · {pole}</small><h1>{pole === 'North Pole' ? 'Biegun północny' : 'Biegun południowy'} — obserwatorium 3D</h1></div><EvidenceBadge kind="observation">ZWERYFIKOWANE EFEMERYDY</EvidenceBadge></div>
    <div className="selector-grid"><label>Obiekt<select value={body} onChange={event => setBody(event.target.value as 'Sun' | 'Moon')}><option>Sun</option><option>Moon</option></select></label><label>Rok<select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select></label><label>Sezon<select value={season} onChange={event => setSeason(event.target.value)}><option value="vernal">Równonoc marcowa</option><option value="summer">Przesilenie czerwcowe</option><option value="autumnal">Równonoc wrześniowa</option><option value="winter">Przesilenie grudniowe</option></select></label></div>
    <div className="observatory-grid"><div className="polar-canvas" ref={host}/><aside className="panel">{chosen ? <><h2>{body} · {chosen.year}</h2><div className="fact"><span>Czas UTC</span><b>{formatUtc(chosen.timestamp_utc)}</b></div><div className="fact"><span>Wysokość nad horyzontem</span><b>{chosen.apparent_altitude_deg.toFixed(3)}°</b></div><div className="fact"><span>Deklinacja</span><b>{chosen.declination_deg.toFixed(3)}°</b></div><div className="fact"><span>Różnica od żądanego czasu</span><b>{hoursBetween(requested, chosen.timestamp_utc).toFixed(1)} h</b></div><p className="muted">Wektor pokazuje kierunek wynikający z wybranej, rzeczywiście zapisanej obserwacji. Nie jest animacją fotograficzną.</p></> : <p>Brak obserwacji dla filtra.</p>}</aside></div>
  </section>
}

function DataAvailability({ polar, solar, hazards, copernicus, flood }: { polar: PolarRow[]; solar: SolarData | null; hazards: HazardData | null; copernicus: CopernicusData | null; flood: FloodMeta | null }) {
  const years = polar.map(row => row.year)
  return <section className="availability"><div className="section-title"><div><small>DATA AVAILABILITY</small><h2>Rzeczywisty zakres opublikowanych danych</h2></div><EvidenceBadge kind="unknown">NIE JEST TO CIĄGŁY OBRAZ NA ŻYWO</EvidenceBadge></div><div className="availability-grid">
    <article><b>NASA JPL — bieguny</b><span>{years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'brak'}</span><small>historyczne, zapisane obserwacje równonocy</small></article>
    <article><b>Układ Słoneczny 3D</b><span>{formatUtc(solar?.timestamp_utc)}</span><small>pozycje zablokowane do jednej epoki JPL</small></article>
    <article><b>NASA EONET</b><span>{formatUtc(hazards?.generated_at_utc)}</span><small>najnowszy opublikowany katalog zdarzeń</small></article>
    <article><b>Copernicus STAC</b><span>{copernicus?.metadata?.data_poczatkowa ?? '—'} — {copernicus?.metadata?.data_koncowa ?? '—'}</span><small>zakres zapytania katalogowego</small></article>
    <article><b>Sentinel-1 powódź</b><span>{flood?.before_period?.join(' → ') ?? 'przed: metadane w mapie'} / {flood?.after_period?.join(' → ') ?? 'po: metadane w mapie'}</span><small>warstwa kandydacka zmian odbicia</small></article>
  </div></section>
}

function App() {
  const [tab, setTab] = useState<Tab>('control'); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState<Speed>('day')
  const [solar] = useJson<SolarData>('data/solar-system.json'); const [hazards, hazardError] = useJson<HazardData>('data/hazards.json'); const [sources] = useJson<Source[]>('data/sources.json'); const [polar] = useJson<PolarRow[]>('data/observations.json')
  const [copernicus] = useJson<CopernicusData>('data/copernicus/latest_results.json'); const [flood] = useJson<FloodMeta>('flood-map/assets/map-data.json')
  const timestamps = useMemo(() => {
    const values = (polar ?? []).map(row => row.timestamp_utc)
    if (hazards?.generated_at_utc) values.push(hazards.generated_at_utc)
    if (solar?.timestamp_utc) values.push(solar.timestamp_utc)
    return [...new Set(values)].sort()
  }, [polar, hazards, solar])
  const [requested, setRequested] = useState('2024-03-20T03:06:00.000Z')
  const selected = nearestTimestamp(requested, timestamps)
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setRequested(current => stepDate(current, speed)), 1200); return () => clearInterval(timer) }, [playing, speed])
  const tabs: [Tab, string][] = [['control','Centrum sterowania'],['earth','Ziemia 3D'],['floods','Powodzie'],['fires','Pożary'],['water','Woda i susza'],['north','Biegun północny'],['south','Biegun południowy'],['solar','Słońce i Księżyc'],['sources','Dane i źródła']]
  return <div className="app-shell control-center-app"><header className="app-header"><a className="brand" href={base}><span className="brand-mark">T</span><span><strong>TERRA OBSERVATION</strong><small>Time-aware environmental intelligence</small></span></a><nav className="main-tabs" aria-label="Główne sekcje">{tabs.map(([id,label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav><div className="live"><i/> OPEN SCIENCE</div></header>
    <main><TimeController requested={requested} selected={selected} timestamps={timestamps} playing={playing} speed={speed} onRequested={setRequested} onPlaying={setPlaying} onSpeed={setSpeed}/>
      {tab === 'control' && <><section className="hero compact"><div className="eyebrow">EARTH · WATER · FIRE · SUN · MOON · UTC</div><h1>Centrum sterowania<br/><em>czasem i dowodami.</em></h1><p>Każdy widok reaguje na najbliższą rzeczywiście dostępną obserwację. System nie udaje ciągłego filmu satelitarnego ani skali zagrożenia, której nie ma w danych.</p><div className="hero-actions"><button className="primary" onClick={() => setTab('earth')}>Otwórz Ziemię 3D</button><button onClick={() => setTab('north')}>Obserwuj biegun</button><a className="button-link" href={`${base}copernicus/`}>Panel Copernicus</a></div></section><DataAvailability polar={polar ?? []} solar={solar} hazards={hazards} copernicus={copernicus} flood={flood}/></>}
      {tab === 'earth' && <section className="workspace"><div className="workspace-head"><div><small>NASA EONET · SELECTED UTC</small><h1>Ziemia 3D i geometria zdarzeń</h1></div><EvidenceBadge kind="observation">PUNKTY KATALOGOWE, NIE SKALA ZAGROŻENIA</EvidenceBadge></div>{hazards ? <div className="hazard-layout"><EarthGlobe data={hazards} selectedTime={selected}/><aside className="panel"><h2>Warstwy i źródła</h2><div className="fact"><span>Zdarzenia widoczne do</span><b>{formatUtc(selected)}</b></div><div className="fact"><span>Wygenerowano katalog</span><b>{formatUtc(hazards.generated_at_utc)}</b></div><a className="button-link block" href={`${base}flood-map/`}>Mapa Sentinel-1</a><a className="button-link block" href={`${base}copernicus/`}>Wyniki Copernicus</a><p className="muted">EONET opisuje geometrię zdarzeń. Nie mierzy automatycznie intensywności, powierzchni szkód ani ryzyka dla ludzi.</p></aside></div> : <p>{hazardError ?? 'Ładowanie danych…'}</p>}</section>}
      {tab === 'floods' && <section className="workspace"><div className="workspace-head"><div><small>SENTINEL-1 SAR</small><h1>Powodzie — porównanie przed/po</h1></div><EvidenceBadge kind="derived">ZMIANA ODBICIA RADAROWEGO</EvidenceBadge></div><div className="cards"><article><h2>Interaktywna mapa</h2><p>Warstwy przed, po i różnica radarowa dla opublikowanego przebiegu.</p><a className="button-link block" href={`${base}flood-map/`}>Otwórz mapę</a></article><article><h2>Czas obserwacji</h2><p>Wybrany globalny czas: {formatUtc(selected)}. Mapa zawiera tylko epoki zapisane w metadanych przebiegu.</p></article><article><h2>Ograniczenie</h2><p>Zmiana sygnału nie jest sama w sobie potwierdzonym zasięgiem zalania. Potrzebne są progi, maska stałych wód i walidacja.</p></article></div></section>}
      {tab === 'fires' && <section className="workspace"><div className="workspace-head"><div><small>NASA EONET · FIRMS READY</small><h1>Pożary</h1></div><EvidenceBadge kind="unknown">BRAK FRP W BIEŻĄCYM PLIKU</EvidenceBadge></div><p className="notice">Pokazujemy wyłącznie kategorie i geometrię zdarzeń dostępne w opublikowanym katalogu. Nie wyliczamy niskiej, średniej ani wysokiej skali zagrożenia bez pikseli FIRMS/FRP.</p>{hazards && <EarthGlobe data={hazards} selectedTime={selected}/>}</section>}
      {tab === 'water' && <section className="workspace"><div className="workspace-head"><div><small>SURFACE · STORAGE · SUBSURFACE</small><h1>Woda i susza</h1></div></div><div className="water-grid"><article><EvidenceBadge kind="observation"/><h2>Powierzchnia</h2><p>Sentinel-1 i Sentinel-2 mogą wyznaczać zasięg wody w momentach przelotu.</p></article><article><EvidenceBadge kind="estimate"/><h2>Retencja i gleba</h2><p>Wnioski wymagają połączenia wielu źródeł i modeli, a nie pojedynczego obrazu.</p></article><article><EvidenceBadge kind="unknown"/><h2>Woda w skałach</h2><p>Satelity nie pokazują bezpośrednio wody w szczelinach; potrzebne są pomiary terenowe.</p></article></div></section>}
      {tab === 'north' && <PolarObservatory rows={polar ?? []} pole="North Pole" requested={requested}/>} {tab === 'south' && <PolarObservatory rows={polar ?? []} pole="South Pole" requested={requested}/>} 
      {tab === 'solar' && <section className="workspace"><div className="workspace-head"><div><small>NASA JPL HORIZONS · LOCKED EPOCH</small><h1>Słońce i Księżyc</h1></div><EvidenceBadge kind="observation">POZYCJE ZABLOKOWANE DO {formatUtc(solar?.timestamp_utc)}</EvidenceBadge></div><p className="notice"><b>Uczciwe sterowanie czasem:</b> globalny suwak nie przesuwa planet historycznie, ponieważ repozytorium zawiera obecnie jeden snapshot układu. Do obserwacji historycznych użyj danych polarnych 2006–2024 w zakładkach biegunów.</p>{solar && <div className="solar-list">{solar.bodies.map(body => <article key={body.body}><b>{body.body}</b><span>{body.position_au.map(value => value.toFixed(4)).join(', ')} AU</span><small>{body.source}</small></article>)}</div>}</section>}
      {tab === 'sources' && <section className="workspace"><div className="workspace-head"><div><small>PROVENANCE REGISTRY</small><h1>Dane i źródła</h1></div></div><DataAvailability polar={polar ?? []} solar={solar} hazards={hazards} copernicus={copernicus} flood={flood}/><div className="source-list">{sources?.map(source => <article key={source.id}><div className="source-title"><span>{source.agency}</span><h2>{source.mission} · {source.instrument}</h2></div><p>{source.limitations}</p><a href={source.url} target="_blank" rel="noreferrer">Oficjalna dokumentacja ↗</a></article>)}</div></section>}
    </main><footer><span>Terraforming Planet · Open environmental research</span><span>Evidence before claims · No person tracking</span></footer></div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
