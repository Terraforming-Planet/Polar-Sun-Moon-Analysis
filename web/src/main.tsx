import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { AIResearchPanel } from './AIResearchPanel'
import { HydrologyPanel } from './HydrologyPanel'
import { RealisticEarthGlobe } from './RealisticEarthGlobe'
import './styles.css'
import './control-center.css'
import './welcome-gate.css'

type Tab = 'control' | 'ai' | 'agentic' | 'earth' | 'floods' | 'fires' | 'water' | 'north' | 'south' | 'solar' | 'sources'
type EntryMode = 'chooser' | 'simple' | 'advanced'
type EvidenceClass = 'observation' | 'derived' | 'estimate' | 'hypothesis' | 'unknown'
type Body = { body: string; position_au: [number, number, number]; source: string }
type SolarData = { timestamp_utc: string; scale_note: string; bodies: Body[] }
type HazardFeature = {
  geometry: { type: string; coordinates: number[] | number[][][] }
  properties: { title?: string; categories?: string[]; observation_time?: string; source_url?: string }
}
type HazardData = { generated_at_utc?: string; generatedUtc?: string; notice?: string; features?: HazardFeature[]; alerts?: unknown[] }
type Source = { id: string; agency: string; mission: string; instrument: string; temporal_coverage: string; spatial_resolution: string; access: string; url: string; limitations: string }
type PolarRow = {
  year: number
  season: string
  pole: string
  body: string
  timestamp_utc: string
  apparent_altitude_deg: number
  declination_deg: number
  source_url?: string
  quality_flag?: string
}
type CopernicusData = {
  metadata?: {
    data_poczatkowa?: string
    data_koncowa?: string
    run_at_utc?: string
    status?: string
    observation_count?: number
  }
  observations?: unknown[]
}
type FloodMeta = { before_period?: string[]; after_period?: string[]; generated_at_utc?: string; evidence_class?: string; run_metadata?: Record<string, unknown> }
type Speed = 'hour' | 'day' | 'month' | 'year'
type HazardCategory = 'all' | 'fire' | 'flood'

const base = import.meta.env.BASE_URL
const isoInput = (value: string) => value ? new Date(value).toISOString().slice(0, 16) : ''
const formatUtc = (value?: string) => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : 'no data'
const hoursBetween = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000

function useJson<T>(path: string, refreshEveryMs = 0): [T | null, string | null] {
  const [value, setValue] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      const separator = path.includes('?') ? '&' : '?'
      fetch(`${base}${path}${separator}refresh=${Date.now()}`, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`${response.status} ${path}`)
        return response.json() as Promise<T>
      }).then(next => {
        if (cancelled) return
        setValue(next)
        setError(null)
      }).catch(reason => {
        if (!cancelled) setError(String(reason))
      })
    }
    load()
    const timer = refreshEveryMs > 0 ? window.setInterval(load, refreshEveryMs) : undefined
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [path, refreshEveryMs])
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
  requested: string
  selected: string
  timestamps: string[]
  playing: boolean
  speed: Speed
  onRequested: (value: string) => void
  onPlaying: (value: boolean) => void
  onSpeed: (value: Speed) => void
}) {
  const sorted = [...timestamps].sort()
  const index = Math.max(0, sorted.indexOf(selected))
  const move = (direction: number) => {
    if (!sorted.length) return
    const next = Math.max(0, Math.min(sorted.length - 1, index + direction))
    onRequested(sorted[next])
  }
  const age = selected ? hoursBetween(selected, new Date().toISOString()) : 0
  return <section className="time-controller" aria-label="Global UTC observation timeline" onKeyDown={event => {
    if (event.key === 'ArrowLeft') move(-1)
    if (event.key === 'ArrowRight') move(1)
    if (event.key === ' ') { event.preventDefault(); onPlaying(!playing) }
  }} tabIndex={0}>
    <div className="time-head"><div><small>GLOBAL UTC TIMELINE</small><h2>Observation time control</h2></div><EvidenceBadge kind="observation">NEAREST AVAILABLE OBSERVATION</EvidenceBadge></div>
    <div className="time-controls">
      <label>Requested UTC<input aria-label="Requested UTC date and time" type="datetime-local" value={isoInput(requested)} onChange={event => onRequested(new Date(`${event.target.value}:00Z`).toISOString())}/></label>
      <button onClick={() => move(-1)} aria-label="Previous available observation">◀ Previous</button>
      <button className="primary" onClick={() => onPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Ⅱ Pause' : '▶ Play'}</button>
      <button onClick={() => move(1)} aria-label="Next available observation">Next ▶</button>
      <button onClick={() => onRequested(new Date().toISOString())}>NOW / current UTC</button>
      <label>Step<select value={speed} onChange={event => onSpeed(event.target.value as Speed)}><option value="hour">1 hour</option><option value="day">1 day</option><option value="month">1 month</option><option value="year">1 year</option></select></label>
    </div>
    <div className="time-status">
      <span><b>Requested:</b> {formatUtc(requested)}</span><span><b>Selected observation:</b> {formatUtc(selected)}</span><span><b>Difference:</b> {hoursBetween(requested, selected).toFixed(1)} h</span><span><b>Data age:</b> {age.toFixed(1)} h</span><span><b>Range:</b> {formatUtc(sorted[0])} — {formatUtc(sorted.at(-1))}</span>
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

function featureMatchesCategory(feature: HazardFeature, category: HazardCategory) {
  if (category === 'all') return true
  const categories = (feature.properties.categories ?? []).map(value => value.toLowerCase())
  if (category === 'fire') return categories.some(value => value.includes('fire') || value.includes('wildfire'))
  return categories.some(value => value.includes('flood'))
}

function EarthGlobe({ data, selectedTime, category = 'all' }: { data?: HazardData | null; selectedTime: string; category?: HazardCategory }) {
  const markers = useMemo(() => {
    const features = Array.isArray(data?.features) ? data.features : []
    if (!features.length) return []
    const selectedMs = new Date(selectedTime).getTime()
    return features
      .filter(feature => featureMatchesCategory(feature, category))
      .filter(feature => {
        const time = feature.properties.observation_time
        return !time || new Date(time).getTime() <= selectedMs
      })
      .map(feature => {
        const point = featurePoint(feature)
        if (!point) return null
        const [longitude, latitude] = point
        return {
          longitude,
          latitude,
          color: category === 'flood' ? 0x00a8ff : 0xff0000,
          radius: category === 'flood' ? 1.15 : 1.35,
        }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
  }, [category, data, selectedTime])

  return <RealisticEarthGlobe selectedTime={selectedTime} markers={markers} autoRotate />
}

function PolarObservatory({ rows, pole, requested }: { rows: PolarRow[]; pole: 'North Pole' | 'South Pole'; requested: string }) {
  const [body, setBody] = useState<'Sun' | 'Moon'>('Moon')
  const [year, setYear] = useState(2024)
  const [season, setSeason] = useState('vernal')
  const candidates = rows.filter(row => row.pole === pole && row.body === body)
  const exact = candidates.find(row => row.year === year && row.season === season)
  const chosen = exact ?? candidates.reduce<PolarRow | null>((best, row) => !best || hoursBetween(requested, row.timestamp_utc) < hoursBetween(requested, best.timestamp_utc) ? row : best, null)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current || !chosen) return
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 100)
    camera.position.set(5.5, 4.5, 7)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const earth = new THREE.Mesh(new THREE.SphereGeometry(2, 48, 48), new THREE.MeshStandardMaterial({ color: 0x135a8c, roughness: .8 }))
    scene.add(earth)
    scene.add(new THREE.AxesHelper(3.3))
    scene.add(new THREE.AmbientLight(0x9dcfff, 1.8))
    const light = new THREE.DirectionalLight(0xffffff, 2)
    light.position.set(4, 5, 4)
    scene.add(light)
    const y = pole === 'North Pole' ? 2.05 : -2.05
    const observer = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 16), new THREE.MeshBasicMaterial({ color: 0x74ffb8 }))
    observer.position.set(0, y, 0)
    scene.add(observer)
    const horizon = new THREE.Mesh(new THREE.CircleGeometry(2.5, 64), new THREE.MeshBasicMaterial({ color: 0x31cfff, transparent: true, opacity: .13, side: THREE.DoubleSide }))
    horizon.rotation.x = Math.PI / 2
    horizon.position.y = y
    scene.add(horizon)
    const altitude = chosen.apparent_altitude_deg * Math.PI / 180
    const sign = pole === 'North Pole' ? 1 : -1
    const direction = new THREE.Vector3(Math.cos(altitude) * 3.4, y + sign * Math.sin(altitude) * 3.4, 0)
    const arrow = new THREE.ArrowHelper(direction.clone().sub(observer.position).normalize(), observer.position, 3.4, body === 'Sun' ? 0xffd45c : 0xd6e3ff, .35, .18)
    scene.add(arrow)
    let frame = 0
    const resize = () => {
      if (!host.current) return
      renderer.setSize(host.current.clientWidth, host.current.clientHeight, false)
      camera.aspect = host.current.clientWidth / host.current.clientHeight
      camera.updateProjectionMatrix()
    }
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host.current)
    resize()
    animate()
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      host.current?.replaceChildren()
    }
  }, [chosen, pole, body])

  const years = [...new Set(candidates.map(row => row.year))].sort((a, b) => a - b)
  return <section className="workspace"><div className="workspace-head"><div><small>NASA JPL HORIZONS · {pole}</small><h1>{pole} — 3D observatory</h1></div><EvidenceBadge kind="observation">VERIFIED EPHEMERIDES</EvidenceBadge></div>
    <div className="selector-grid"><label>Object<select value={body} onChange={event => setBody(event.target.value as 'Sun' | 'Moon')}><option>Sun</option><option>Moon</option></select></label><label>Year<select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value}>{value}</option>)}</select></label><label>Season<select value={season} onChange={event => setSeason(event.target.value)}><option value="vernal">March equinox</option><option value="summer">June solstice</option><option value="autumnal">September equinox</option><option value="winter">December solstice</option></select></label></div>
    <div className="observatory-grid"><div className="polar-canvas" ref={host}/><aside className="panel">{chosen ? <><h2>{body} · {chosen.year}</h2><div className="fact"><span>UTC time</span><b>{formatUtc(chosen.timestamp_utc)}</b></div><div className="fact"><span>Altitude above horizon</span><b>{chosen.apparent_altitude_deg.toFixed(3)}°</b></div><div className="fact"><span>Declination</span><b>{chosen.declination_deg.toFixed(3)}°</b></div><div className="fact"><span>Difference from requested time</span><b>{hoursBetween(requested, chosen.timestamp_utc).toFixed(1)} h</b></div><p className="muted">The vector shows the direction derived from the selected recorded observation. It is not a photographic animation.</p></> : <p>No observation matches this filter.</p>}</aside></div>
  </section>
}

function DataAvailability({ polar, solar, hazards, copernicus, flood }: { polar: PolarRow[]; solar: SolarData | null; hazards: HazardData | null; copernicus: CopernicusData | null; flood: FloodMeta | null }) {
  const years = polar.map(row => row.year)
  const copernicusStart = copernicus?.metadata?.data_poczatkowa
  const copernicusEnd = copernicus?.metadata?.data_koncowa
  const copernicusCount = copernicus?.metadata?.observation_count ?? copernicus?.observations?.length
  const copernicusLabel = copernicusStart || copernicusEnd
    ? `${copernicusStart ?? 'no start'} — ${copernicusEnd ?? 'no end'}`
    : copernicus?.metadata?.status === 'ok'
      ? `connected · ${copernicusCount ?? 0} observations`
      : 'no published manifest'
  return <section className="availability"><div className="section-title"><div><small>DATA AVAILABILITY</small><h2>Actual published data coverage</h2></div><EvidenceBadge kind="unknown">NOT A CONTINUOUS LIVE SATELLITE FEED</EvidenceBadge></div><div className="availability-grid">
    <article><b>NASA JPL — polar observations</b><span>{years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'none'}</span><small>historical recorded equinox/solstice observations</small></article>
    <article><b>3D Solar System</b><span>{formatUtc(solar?.timestamp_utc)}</span><small>positions locked to one JPL epoch</small></article>
    <article><b>NASA EONET</b><span>{formatUtc(hazards?.generated_at_utc)}</span><small>latest published event catalogue</small></article>
    <article><b>Copernicus STAC</b><span>{copernicusLabel}</span><small>manifest refreshed and published by the CDSE cycle</small></article>
    <article><b>Sentinel-1 flood</b><span>{flood?.before_period?.join(' → ') ?? 'before: map metadata'} / {flood?.after_period?.join(' → ') ?? 'after: map metadata'}</span><small>candidate radar-reflectance change layer</small></article>
  </div></section>
}

function WelcomeGate({ onChoose }: { onChoose: (mode: 'simple' | 'advanced') => void }) {
  return <div className="entry-gate">
    <section className="entry-gate-card" aria-label="Choose Terra Observation interface level">
      <div className="entry-gate-brand"><span className="entry-gate-mark">T</span><span><strong>TERRA OBSERVATION</strong><small>Terraforming Planet · open environmental research</small></span></div>
      <div className="entry-gate-copy"><small>WELCOME</small><h1>Choose how you want to explore Earth.</h1><p>Start with a simple place search or open the complete scientific monitoring console. You can change the view later without reloading the page.</p></div>
      <div className="entry-gate-options">
        <button type="button" className="entry-mode-button primary" onClick={() => onChoose('simple')}><em>RECOMMENDED FOR QUICK USE</em><b>Simple view</b><span>Search any place, inspect the high-resolution 3D Earth view, run a basic satellite analysis and ask the assistant.</span></button>
        <button type="button" className="entry-mode-button" onClick={() => onChoose('advanced')}><em>FULL RESEARCH CONSOLE</em><b>Advanced view</b><span>Open AI Research, Agentic EO, 3D Earth, floods, fires, hydrology, polar observatories, Sun/Moon tools, data sources and the global UTC timeline.</span></button>
      </div>
      <p className="entry-gate-foot">Privacy: user question text is not published or written into research archives. Saved assistant answers and evidence records require an explicit save action.</p>
    </section>
  </div>
}

function App() {
  const [entryMode, setEntryMode] = useState<EntryMode>('chooser')
  const [tab, setTab] = useState<Tab>('ai')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>('day')
  const [liveUtc, setLiveUtc] = useState(() => new Date().toISOString())
  const [solar] = useJson<SolarData>('data/solar-system.json')
  const [hazards, hazardError] = useJson<HazardData>('data/hazards.json', 10_000)
  const [sources] = useJson<Source[]>('data/sources.json')
  const [polar] = useJson<PolarRow[]>('data/observations.json')
  const [copernicus, copernicusError] = useJson<CopernicusData>('data/copernicus/latest.json', 10_000)
  const [flood] = useJson<FloodMeta>('flood-map/assets/map-data.json')

  useEffect(() => {
    const timer = window.setInterval(() => setLiveUtc(new Date().toISOString()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const timestamps = useMemo(() => {
    const values = (polar ?? []).map(row => row.timestamp_utc)
    if (hazards?.generated_at_utc) values.push(hazards.generated_at_utc)
    if (solar?.timestamp_utc) values.push(solar.timestamp_utc)
    return [...new Set(values)].sort()
  }, [polar, hazards, solar])
  const [requested, setRequested] = useState(() => new Date().toISOString())
  const selected = nearestTimestamp(requested, timestamps)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setRequested(current => stepDate(current, speed)), 1200)
    return () => clearInterval(timer)
  }, [playing, speed])

  if (entryMode === 'chooser') return <WelcomeGate onChoose={setEntryMode} />

  if (entryMode === 'simple') {
    return <div className="app-shell control-center-app simple-shell">
      <header className="app-header"><a className="brand" href={base}><span className="brand-mark">T</span><span><strong>TERRA OBSERVATION</strong><small>Simple Earth research</small></span></a><div className="live"><i/> SIMPLE VIEW</div></header>
      <div className="mode-switch-bar"><span>Simple place research · private user prompts</span><button type="button" onClick={() => { setTab('ai'); setEntryMode('advanced') }}>Open Advanced view</button><button type="button" onClick={() => setEntryMode('chooser')}>Change view</button></div>
      <main><AIResearchPanel simpleOnly /></main>
      <footer><span>Terraforming Planet · Open environmental research</span><span>Evidence before claims · No person tracking</span></footer>
    </div>
  }

  const tabs: [Tab, string][] = [
    ['ai', 'AI Research'],
    ['agentic', 'Agentic EO'],
    ['earth', '3D Earth'],
    ['control', 'Control Center'],
    ['floods', 'Floods'],
    ['fires', 'Fires'],
    ['water', 'Water & Drought'],
    ['north', 'North Pole'],
    ['south', 'South Pole'],
    ['solar', 'Sun & Moon'],
    ['sources', 'Data & Sources'],
  ]

  return <div className="app-shell control-center-app"><header className="app-header"><a className="brand" href={base}><span className="brand-mark">T</span><span><strong>TERRA OBSERVATION</strong><small>Time-aware environmental intelligence</small></span></a><nav className="main-tabs" aria-label="Main sections">{tabs.map(([id,label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav><div className="live"><i/> OPEN SCIENCE</div></header>
    <div className="mode-switch-bar"><span>Advanced monitoring console</span><button type="button" onClick={() => setEntryMode('simple')}>Simple view</button><button type="button" onClick={() => setEntryMode('chooser')}>Change view</button></div>
    <main><TimeController requested={requested} selected={selected} timestamps={timestamps} playing={playing} speed={speed} onRequested={setRequested} onPlaying={setPlaying} onSpeed={setSpeed}/>
      {tab === 'control' && <><section className="hero compact"><div className="eyebrow">EARTH · WATER · FIRE · AI · SUN · MOON · UTC</div><h1>Control Earth observations<br/><em>with time and evidence.</em></h1><p>Each view uses the nearest genuinely available observation. The system does not pretend to provide continuous satellite video or a hazard severity that is absent from the source data.</p><div className="hero-actions"><button className="primary" onClick={() => setTab('ai')}>Open AI Research</button><button onClick={() => setTab('earth')}>Open 3D Earth</button><button onClick={() => setTab('north')}>Open polar observatory</button><a className="button-link" href={`${base}copernicus/`}>Copernicus panel</a></div></section><DataAvailability polar={polar ?? []} solar={solar} hazards={hazards} copernicus={copernicus} flood={flood}/>{copernicusError && <p className="notice">Copernicus STAC: {copernicusError}</p>}</>}
      {tab === 'ai' && <AIResearchPanel />}
      {tab === 'agentic' && <section className="workspace"><div className="workspace-head"><div><small>OPENAI AGENTS SDK · PROVENANCE-FIRST EARTH OBSERVATION</small><h1>Agentic EO — multi-agent research coordinator</h1></div><EvidenceBadge kind="observation">LIVE SDK RUN PUBLISHED</EvidenceBadge></div><p className="notice"><b>Scientific boundary:</b> the agents coordinate source selection, evidence checking and next-step planning. They do not turn model memory or visual suspicion into an environmental finding or physical cause.</p><div className="cards"><article><h2>Terra Agentic EO Coordinator</h2><p>Manager agent that decomposes the research question, calls specialist agents as tools and combines their outputs into an evidence-aware research answer.</p></article><article><h2>EO Source Scout</h2><p>Selects suitable official/public EO sources through the controlled registry, including Sentinel-1, Sentinel-2, Landsat and SWOT when the requested phenomenon matches their documented capabilities.</p></article><article><h2>EO Evidence Verifier</h2><p>Checks repository-backed claim status and preserves uncertainty before the coordinator writes conclusions or recommends additional scientific checks.</p></article></div><div className="cards"><article><h2>Vistula TEST 014</h2><p>The published live run preserves <code>environmental_finding_claim=false</code>, <code>water_loss_claim=false</code> and <code>causal_claim=false</code>. The evidence establishes dataset integrity and temporal coverage, not a hydrological cause.</p><a className="button-link block" href="https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/blob/main/docs/published/agentic-eo/vistula-test-014-live.md" target="_blank" rel="noreferrer">Open live Agentic EO evidence ↗</a></article><article><h2>Architecture & guardrails</h2><p>Read the research architecture, deterministic tool boundaries, provenance rules, uncertainty handling and validation evidence used for the ESA-oriented Agentic EO work.</p><a className="button-link block" href="https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/blob/main/docs/ESA_AGENTIC_EO.md" target="_blank" rel="noreferrer">Open Agentic EO documentation ↗</a></article><article><h2>Public execution trace</h2><p>The allow-listed trace records the coordinator plus successful calls to <code>consult_eo_source_scout</code> and <code>consult_evidence_verifier</code>. It excludes prompts, chain-of-thought, credentials and private tool payloads.</p><a className="button-link block" href={`${base}published/agentic-eo/vistula-test-014-live.json`} target="_blank" rel="noreferrer">Open structured run evidence ↗</a></article></div></section>}
      {tab === 'earth' && <section className="workspace"><div className="workspace-head"><div><small>LIVE UTC · HIGH-RESOLUTION EARTH MODEL</small><h1>3D Earth — high-resolution reference view</h1></div><EvidenceBadge kind="observation">DEFAULT: HIGH-RESOLUTION REFERENCE BASEMAP</EvidenceBadge></div><div className="hazard-layout"><RealisticEarthGlobe selectedTime={liveUtc} markers={[]} autoRotate/><aside className="panel"><h2>Current view</h2><div className="fact"><span>Model clock refresh</span><b>every 10 seconds</b></div><div className="fact"><span>Current UTC</span><b>{formatUtc(liveUtc)}</b></div><div className="fact"><span>Hazard catalogue generated</span><b>{formatUtc(hazards?.generated_at_utc ?? hazards?.generatedUtc)}</b></div>{hazardError && <p className="muted">Event catalogue temporarily unavailable: {hazardError}. The 3D Earth model operates independently.</p>}<a className="button-link block" href={`${base}flood-map/`}>Sentinel-1 flood map</a><a className="button-link block" href={`${base}copernicus/`}>Copernicus results</a><p className="muted">The default high-resolution basemap is useful for tracing terrain and riverbeds. Dated scientific claims must still be verified with official observation products.</p></aside></div></section>}
      {tab === 'floods' && <section className="workspace"><div className="workspace-head"><div><small>SENTINEL-1 SAR · 3D FLOOD LAYER</small><h1>Floods — 3D model and before/after comparison</h1></div><EvidenceBadge kind="derived">BLUE CATALOGUE POINTS</EvidenceBadge></div><EarthGlobe data={hazards} selectedTime={liveUtc} category="flood"/><div className="cards"><article><h2>Interactive map</h2><p>Before, after and radar-difference layers for the published processing run.</p><a className="button-link block" href={`${base}flood-map/`}>Open map</a></article><article><h2>Observation time</h2><p>Current model time: {formatUtc(liveUtc)}. The map contains only epochs recorded in processing metadata.</p></article><article><h2>Limitation</h2><p>A radar signal change is not by itself a confirmed flood extent. Thresholds, permanent-water masks and validation are required.</p></article></div></section>}
      {tab === 'fires' && <section className="workspace"><div className="workspace-head"><div><small>NASA EONET · FIRMS READY · LIVE UTC</small><h1>Fires — red 3D markers</h1></div><EvidenceBadge kind="observation">RED FIRE POINTS</EvidenceBadge></div><p className="notice">This layer shows only events classified as fire. The site checks data and its clock every 10 seconds, while new satellite observations appear according to the actual publication cadence of the source.</p><EarthGlobe data={hazards} selectedTime={liveUtc} category="fire"/></section>}
      {tab === 'water' && <HydrologyPanel baseUrl={base}/>} 
      {tab === 'north' && <PolarObservatory rows={polar ?? []} pole="North Pole" requested={requested}/>} {tab === 'south' && <PolarObservatory rows={polar ?? []} pole="South Pole" requested={requested}/>} 
      {tab === 'solar' && <section className="workspace"><div className="workspace-head"><div><small>NASA JPL HORIZONS · LOCKED EPOCH</small><h1>Sun & Moon</h1></div><EvidenceBadge kind="observation">POSITIONS LOCKED TO {formatUtc(solar?.timestamp_utc)}</EvidenceBadge></div><p className="notice"><b>Evidence-aware time control:</b> the global slider does not historically move the planets because the repository currently contains one solar-system snapshot. For historical observation studies, use the 2006–2024 polar records in the North/South Pole tabs.</p>{solar && <div className="solar-list">{solar.bodies.map(body => <article key={body.body}><b>{body.body}</b><span>{body.position_au.map(value => value.toFixed(4)).join(', ')} AU</span><small>{body.source}</small></article>)}</div>}</section>}
      {tab === 'sources' && <section className="workspace"><div className="workspace-head"><div><small>PROVENANCE REGISTRY</small><h1>Data & Sources</h1></div></div><DataAvailability polar={polar ?? []} solar={solar} hazards={hazards} copernicus={copernicus} flood={flood}/>{copernicusError && <p className="notice">Copernicus STAC: {copernicusError}</p>}<div className="source-list">{sources?.map(source => <article key={source.id}><div className="source-title"><span>{source.agency}</span><h2>{source.mission} · {source.instrument}</h2></div><p>{source.limitations}</p><a href={source.url} target="_blank" rel="noreferrer">Official documentation ↗</a></article>)}</div></section>}
    </main><footer><span>Terraforming Planet · Open environmental research</span><span>Evidence before claims · No person tracking</span></footer></div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
