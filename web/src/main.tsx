import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './styles.css'

type Tab = 'mission' | 'solar' | 'polar' | 'hazards' | 'water' | 'sources'
type Body = { body: string; position_au: [number, number, number]; source: string }
type SolarData = { timestamp_utc: string; scale_note: string; bodies: Body[] }
type HazardFeature = {
  geometry: { type: string; coordinates: number[] | number[][][] }
  properties: { title?: string; categories?: string[]; observation_time?: string; source_url?: string }
}
type HazardData = { generated_at_utc: string; notice: string; features: HazardFeature[] }
type Source = {
  id: string; agency: string; mission: string; instrument: string; phenomena: string[]
  temporal_coverage: string; latency: string; spatial_resolution: string; access: string
  url: string; limitations: string
}
type PolarRow = {
  year: number; season: string; pole: string; body: string; timestamp_utc: string
  apparent_altitude_deg: number; declination_deg: number
}

const base = import.meta.env.BASE_URL
const bodyColors: Record<string, number> = {
  Sun: 0xffd15c, Mercury: 0xa9a9a9, Venus: 0xdba66b, Earth: 0x3f83ff,
  Moon: 0xd6d9df, Mars: 0xd76543, Jupiter: 0xd7a472, Saturn: 0xe3cf8f,
  Uranus: 0x83d8e5, Neptune: 0x315dce
}

function useJson<T>(path: string): [T | null, string | null] {
  const [value, setValue] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${base}data/${path}`)
      .then(response => {
        if (!response.ok) throw new Error(`${response.status}`)
        return response.json() as Promise<T>
      })
      .then(setValue)
      .catch(reason => setError(String(reason)))
  }, [path])
  return [value, error]
}

function scaledPosition(position: [number, number, number], trueScale: boolean): THREE.Vector3 {
  const vector = new THREE.Vector3(...position)
  const distance = vector.length()
  if (!distance) return vector
  const radius = trueScale ? distance * 16 : Math.log10(1 + distance * 120) * 13
  return vector.normalize().multiplyScalar(radius)
}

function SolarSystem({ data, trueScale }: { data: SolarData; trueScale: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030711, 0.006)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1000)
    camera.position.set(0, 34, 64)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.minDistance = 5
    controls.maxDistance = 180

    scene.add(new THREE.AmbientLight(0x7897c5, 1.4))
    const sunLight = new THREE.PointLight(0xffe1a1, 1800, 250)
    scene.add(sunLight)

    const stars = new THREE.BufferGeometry()
    const starPoints: number[] = []
    for (let index = 0; index < 1700; index += 1) {
      const radius = 180 + Math.random() * 180
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPoints.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3))
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xb9d4ff, size: 0.34 })))

    data.bodies.forEach(body => {
      const position = scaledPosition(body.position_au, trueScale)
      const isSun = body.body === 'Sun'
      const isMoon = body.body === 'Moon'
      const size = isSun ? 2.5 : isMoon ? 0.34 : body.body === 'Jupiter' ? 1.15 : body.body === 'Saturn' ? 1.0 : 0.62
      const material = new THREE.MeshStandardMaterial({
        color: bodyColors[body.body] ?? 0xffffff,
        emissive: isSun ? 0xff9d26 : 0x000000,
        emissiveIntensity: isSun ? 2.2 : 0,
        roughness: 0.78
      })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 32), material)
      mesh.position.copy(position)
      scene.add(mesh)
      if (!isSun && position.length() > 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(position.length() - 0.025, position.length() + 0.025, 180),
          new THREE.MeshBasicMaterial({ color: 0x29476f, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
        )
        ring.rotation.x = Math.PI / 2
        scene.add(ring)
      }
      if (body.body === 'Saturn') {
        const rings = new THREE.Mesh(
          new THREE.RingGeometry(1.35, 2.0, 64),
          new THREE.MeshBasicMaterial({ color: 0xbcae7d, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
        )
        rings.position.copy(position)
        rings.rotation.x = 1.2
        scene.add(rings)
      }
    })

    let frame = 0
    const resize = () => {
      if (!host.current) return
      const { clientWidth, clientHeight } = host.current
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    resize(); animate()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose()
      host.current?.replaceChildren()
    }
  }, [data, trueScale])
  return <div className="space-canvas" ref={host} aria-label="Interaktywny model 3D Układu Słonecznego" />
}

function featurePoint(feature: HazardFeature): [number, number] | null {
  if (feature.geometry.type === 'Point') return feature.geometry.coordinates as [number, number]
  const polygon = feature.geometry.coordinates as number[][][]
  if (!polygon[0]?.length) return null
  const sum = polygon[0].reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / polygon[0].length, sum[1] / polygon[0].length]
}

function HazardGlobe({ data }: { data: HazardData }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 8.4)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.current.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.minDistance = 4.4; controls.maxDistance = 14
    const globe = new THREE.Group()
    scene.add(globe)
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(2.65, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0x082b4c, roughness: 0.9, metalness: 0.05 })
    ))
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(2.68, 36, 24),
      new THREE.MeshBasicMaterial({ color: 0x2c7db7, wireframe: true, transparent: true, opacity: 0.16 })
    ))
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(2.74, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x39b9ff, transparent: true, opacity: 0.08, side: THREE.BackSide })
    ))
    scene.add(new THREE.AmbientLight(0x8ac8ff, 1.8))
    const directional = new THREE.DirectionalLight(0xffffff, 2.4); directional.position.set(4, 3, 5); scene.add(directional)

    data.features.slice(0, 250).forEach(feature => {
      const point = featurePoint(feature); if (!point) return
      const [lon, lat] = point
      const phi = (90 - lat) * Math.PI / 180
      const theta = (lon + 180) * Math.PI / 180
      const radius = 2.72
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff6d4a })
      )
      marker.position.set(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
      globe.add(marker)
    })
    let frame = 0
    const resize = () => {
      if (!host.current) return
      renderer.setSize(host.current.clientWidth, host.current.clientHeight, false)
      camera.aspect = host.current.clientWidth / host.current.clientHeight; camera.updateProjectionMatrix()
    }
    const animate = () => { frame = requestAnimationFrame(animate); globe.rotation.y += 0.0006; controls.update(); renderer.render(scene, camera) }
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize(); animate()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); host.current?.replaceChildren() }
  }, [data])
  return <div className="globe-canvas" ref={host} aria-label="Globus 3D aktualnych zdarzeń NASA EONET" />
}

function PolarChart({ rows }: { rows: PolarRow[] }) {
  const filtered = rows.filter(row => row.pole === 'North Pole' && row.body === 'Moon' && row.season === 'vernal')
  if (!filtered.length) return <Empty text="Brak wygenerowanych obserwacji polarnych." />
  const values = filtered.map(row => row.apparent_altitude_deg)
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1
  const points = filtered.map((row, index) => `${20 + index * 660 / Math.max(filtered.length - 1, 1)},${180 - (row.apparent_altitude_deg - min) / span * 140}`).join(' ')
  return <div className="chart-wrap">
    <svg viewBox="0 0 700 210" role="img" aria-label="Wykres wysokości Księżyca">
      <defs><linearGradient id="chart" x1="0" x2="1"><stop stopColor="#31d7ff"/><stop offset="1" stopColor="#8c7bff"/></linearGradient></defs>
      {[40, 80, 120, 160].map(y => <line key={y} x1="20" y1={y} x2="680" y2={y} className="grid-line" />)}
      <polyline points={points} fill="none" stroke="url(#chart)" strokeWidth="4" strokeLinejoin="round" />
    </svg>
    <div className="chart-legend"><span>{filtered[0]?.year}</span><span>Moon · North Pole · vernal</span><span>{filtered.at(-1)?.year}</span></div>
  </div>
}

function Empty({ text }: { text: string }) { return <div className="empty"><span>DATA STATUS</span><p>{text}</p></div> }
function Metric({ value, label, tone = 'blue' }: { value: string | number; label: string; tone?: string }) {
  return <div className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>
}

function App() {
  const [tab, setTab] = useState<Tab>('mission')
  const [trueScale, setTrueScale] = useState(false)
  const [solar, solarError] = useJson<SolarData>('solar-system.json')
  const [hazards, hazardError] = useJson<HazardData>('hazards.json')
  const [sources] = useJson<Source[]>('sources.json')
  const [polar] = useJson<PolarRow[]>('observations.json')
  const categoryCount = useMemo(() => {
    const result = new Map<string, number>()
    hazards?.features.forEach(item => item.properties.categories?.forEach(category => result.set(category, (result.get(category) ?? 0) + 1)))
    return [...result.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [hazards])
  const tabs: [Tab, string][] = [['mission','Misja'],['solar','Układ 3D'],['polar','Bieguny'],['hazards','Zagrożenia'],['water','Woda'],['sources','Źródła']]
  return <div className="app-shell">
    <header>
      <a className="brand" href="#"><span className="brand-mark">T</span><span><strong>TERRA OBSERVATION</strong><small>Environmental intelligence system</small></span></a>
      <nav>{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
      <div className="live"><i/> OPEN SCIENCE</div>
    </header>

    <main>
      {tab === 'mission' && <>
        <section className="hero">
          <div className="eyebrow">EARTH · WATER · FIRE · SPACE</div>
          <h1>Obserwacja planety<br/><em>oparta na dowodach.</em></h1>
          <p>Łączymy zweryfikowane efemerydy NASA JPL z publicznymi danymi obserwacji Ziemi. Każda wartość zachowuje źródło, czas i ograniczenia pomiaru.</p>
          <div className="hero-actions"><button className="primary" onClick={() => setTab('solar')}>Uruchom model 3D</button><button className="secondary" onClick={() => setTab('sources')}>Sprawdź źródła</button></div>
        </section>
        <section className="metrics-row">
          <Metric value={polar?.length ?? '—'} label="zweryfikowanych obserwacji polarnych"/>
          <Metric value={hazards?.features.length ?? '—'} label="otwartych zdarzeń NASA EONET" tone="orange"/>
          <Metric value={sources?.length ?? '—'} label="oficjalnych źródeł w katalogu" tone="green"/>
          <Metric value="STRICT" label="publiczny filtr prywatności" tone="purple"/>
        </section>
        <section className="cards">
          <article><span>01</span><h2>Polarna geometria</h2><p>Rzeczywista deklinacja oraz wysokość Słońca i Księżyca z NASA JPL Horizons.</p></article>
          <article><span>02</span><h2>Wczesne sygnały</h2><p>Pożary, powodzie i zmiany wody z jasno opisaną aktualnością oraz niepewnością.</p></article>
          <article><span>03</span><h2>Odpowiedzialne decyzje</h2><p>System odróżnia obserwację, wartość pochodną, estymację, hipotezę i brak wiedzy.</p></article>
        </section>
      </>}

      {tab === 'solar' && <section className="workspace">
        <div className="workspace-head"><div><div className="eyebrow">NASA JPL HORIZONS · ICRF</div><h1>Układ Słoneczny 3D</h1></div><label className="switch"><input type="checkbox" checked={trueScale} onChange={event => setTrueScale(event.target.checked)}/><span/> Skala odległości: {trueScale ? 'liniowa' : 'wizualna'}</label></div>
        {solar ? <SolarSystem data={solar} trueScale={trueScale}/> : <Empty text={solarError ? `Nie udało się wczytać danych: ${solarError}` : 'Ładowanie wektorów JPL…'}/>} 
        {solar && <div className="data-strip"><span>Epoka: <b>{new Date(solar.timestamp_utc).toLocaleString('pl-PL', {timeZone:'UTC'})} UTC</b></span><span>{solar.scale_note}</span><span>Pozycje: <b>JPL Horizons</b></span></div>}
      </section>}

      {tab === 'polar' && <section className="workspace">
        <div className="workspace-head"><div><div className="eyebrow">NORTH 90° · SOUTH −90°</div><h1>Obserwatorium polarne</h1></div><div className="badge good">AIRLESS · UTC · DEG</div></div>
        <div className="two-column"><div className="panel"><h2>Wysokość Księżyca podczas równonocy</h2><PolarChart rows={polar ?? []}/></div><div className="panel evidence"><h2>Łańcuch dowodowy</h2><ol><li><b>NASA API</b><span>Odpowiedź i wersja API</span></li><li><b>Walidacja</b><span>DEC z quantity 2, Elev z quantity 4</span></li><li><b>SHA-256</b><span>Integralność odpowiedzi</span></li><li><b>Eksport</b><span>CSV · JSON · XLSX · PDF</span></li></ol></div></div>
        <div className="notice"><b>Ważne:</b> Horizons zwraca efemerydy — wyniki obliczone z aktualnych modeli i obserwacji astronomicznych. Nie są to fotografie satelitarne.</div>
      </section>}

      {tab === 'hazards' && <section className="workspace">
        <div className="workspace-head"><div><div className="eyebrow">NASA EONET · FIRMS READY</div><h1>Monitor zagrożeń Ziemi</h1></div><div className="badge warn">NIE ZASTĘPUJE SŁUŻB ALARMOWYCH</div></div>
        <div className="hazard-layout">{hazards ? <HazardGlobe data={hazards}/> : <Empty text={hazardError ? `Błąd danych: ${hazardError}` : 'Pobieranie aktualnych zdarzeń…'}/>}<aside className="panel"><h2>Aktualne kategorie</h2>{categoryCount.map(([category,count]) => <div className="category" key={category}><span>{category}</span><b>{count}</b></div>)}<hr/><p className="muted">Punkty pokazują geometrię wydarzeń katalogowanych przez NASA EONET. Nie przypisujemy im zmyślonej skali zagrożenia.</p></aside></div>
        {hazards && <div className="data-strip"><span>Aktualizacja: <b>{new Date(hazards.generated_at_utc).toLocaleString('pl-PL')}</b></span><span>{hazards.notice}</span></div>}
      </section>}

      {tab === 'water' && <section className="workspace">
        <div className="workspace-head"><div><div className="eyebrow">SURFACE · STORAGE · SUBSURFACE</div><h1>Woda jako system</h1></div></div>
        <div className="water-grid">
          <article><span className="tag">OBSERVATION</span><h2>Powierzchnia</h2><p>Sentinel-1 SAR, Sentinel-2 i Landsat wykrywają zasięg wody. SWOT dostarcza wysokość powierzchni i nachylenie rzek.</p></article>
          <article><span className="tag estimate">MODEL ESTIMATE</span><h2>Woda w górach</h2><p>Łączenie śniegu, SMAP, GRACE-FO i InSAR. Dokładna woda w szczelinach skał wymaga ERT, MT, sejsmiki i odwiertów.</p></article>
          <article><span className="tag unknown">LIMITATION</span><h2>Dno oceanu</h2><p>Altimetria satelitarna daje pośredni model. Dokładną batymetrię uzyskuje sonar wielowiązkowy, AUV lub ROV.</p></article>
        </div>
        <div className="lake-example"><div><small>PRZYKŁAD ALGORYTMU</small><strong>10 km² → 1 km²</strong><span>−9 km² · −90%</span></div><p>Objętość pozostaje <b>UNKNOWN</b>, dopóki nie ma batymetrii lub relacji powierzchnia–wysokość–objętość. System nie zamienia powierzchni w fikcyjną objętość.</p></div>
      </section>}

      {tab === 'sources' && <section className="workspace">
        <div className="workspace-head"><div><div className="eyebrow">PROVENANCE REGISTRY</div><h1>Oficjalne źródła danych</h1></div></div>
        <div className="source-list">{sources?.map(source => <article key={source.id}><div className="source-title"><span>{source.agency}</span><h2>{source.mission} · {source.instrument}</h2></div><div className="source-meta"><span><b>Zakres</b>{source.temporal_coverage}</span><span><b>Rozdzielczość</b>{source.spatial_resolution}</span><span><b>Dostęp</b>{source.access}</span></div><p>{source.limitations}</p><a href={source.url} target="_blank" rel="noreferrer">Oficjalna dokumentacja ↗</a></article>) ?? <Empty text="Ładowanie katalogu źródeł…"/>}</div>
      </section>}
    </main>
    <footer><span>Terraforming Planet · Open environmental research</span><span>Privacy by design · No person tracking · Evidence before claims</span></footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
