import { useEffect, useMemo, useRef, useState } from 'react'

import './tiled-earth.css'

type ObserverSite = {
  id: string
  label: string
  country: string
  longitude: number
  latitude: number
  kind: 'partial' | 'total'
  coverage?: string
  localMaximum?: string
  note: string
}

type GoesFrame = {
  observed_utc: string
  captured_utc: string
  file: string
  source_url: string
  sha256: string
}

type GoesManifest = {
  source?: string
  cadence_minutes?: number
  satellite_photography?: boolean
  synthetic?: boolean
  frames?: GoesFrame[]
  updated_utc?: string
}

type CesiumApi = {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => any
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => any
  Cartesian3: { fromDegrees: (longitude: number, latitude: number, height?: number) => any }
  Color: { fromCssColorString: (value: string) => any }
  JulianDate: { fromIso8601: (value: string) => any }
  Math: { toRadians: (value: number) => number }
}

declare global {
  interface Window {
    Cesium?: CesiumApi
    CESIUM_BASE_URL?: string
  }
}

const CESIUM_VERSION = '1.126'
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const NASA_ECLIPSE = 'https://science.nasa.gov/eclipses/future-eclipses/total-solar-eclipse-on-august-12-2026/'
const NASA_BESSELIAN = 'https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812'
const NOAA_SOURCE = 'https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19'

const observerSites: ObserverSite[] = [
  { id: 'gdansk', label: 'Gdańsk', country: 'Polska', longitude: 18.6466, latitude: 54.3520, kind: 'partial', note: 'Domyślny punkt awaryjny. NASA potwierdza częściowe zaćmienie dla dużej części Europy; lokalnego procentu nie wpisujemy bez niezależnego wyliczenia z elementów Bessela.' },
  { id: 'krakow', label: 'Kraków', country: 'Polska', longitude: 19.9450, latitude: 50.0647, kind: 'partial', coverage: '64%', localMaximum: '19:56 CEST', note: 'NASA podaje 64% zakrycia; faza kończy się przy zachodzie Słońca.' },
  { id: 'warszawa', label: 'Warszawa', country: 'Polska', longitude: 21.0122, latitude: 52.2297, kind: 'partial', note: 'Punkt obserwacyjny w Polsce. Dokładne lokalne okoliczności powinny być wyliczane z oficjalnych elementów Bessela NASA.' },
  { id: 'poznan', label: 'Poznań', country: 'Polska', longitude: 16.9252, latitude: 52.4064, kind: 'partial', note: 'Punkt obserwacyjny w Polsce; zachodni horyzont ma znaczenie, ponieważ zjawisko przypada wieczorem.' },
  { id: 'wroclaw', label: 'Wrocław', country: 'Polska', longitude: 17.0385, latitude: 51.1079, kind: 'partial', note: 'Punkt obserwacyjny w Polsce; widok Cesium służy do geometrii i lokalizacji, nie zastępuje bezpiecznej obserwacji optycznej.' },
  { id: 'szczecin', label: 'Szczecin', country: 'Polska', longitude: 14.5528, latitude: 53.4285, kind: 'partial', note: 'Punkt obserwacyjny w północno-zachodniej Polsce.' },
  { id: 'reykjavik', label: 'Reykjavík', country: 'Islandia', longitude: -21.9426, latitude: 64.1466, kind: 'total', localMaximum: 'około 17:48 UTC', note: 'NASA wskazuje Reykjavík w pasie całkowitości; totalność około 17:48–17:49 czasu lokalnego/UTC.' },
  { id: 'leon', label: 'León', country: 'Hiszpania', longitude: -5.5671, latitude: 42.5987, kind: 'total', localMaximum: 'około 20:29 CEST', note: 'NASA wskazuje León w pasie całkowitości; totalność rozpoczyna się około 20:28 czasu lokalnego.' },
  { id: 'zaragoza', label: 'Zaragoza', country: 'Hiszpania', longitude: -0.8891, latitude: 41.6488, kind: 'total', localMaximum: 'około 20:29 CEST', note: 'NASA wskazuje Zaragozę w pasie całkowitości.' },
  { id: 'valencia', label: 'Valencia', country: 'Hiszpania', longitude: -0.3763, latitude: 39.4699, kind: 'total', localMaximum: 'około 20:32 CEST', note: 'NASA wskazuje Valencię w pasie całkowitości tuż przed zachodem Słońca.' },
  { id: 'barcelona', label: 'Barcelona', country: 'Hiszpania', longitude: 2.1734, latitude: 41.3851, kind: 'partial', coverage: '99%', localMaximum: '20:29 CEST', note: 'NASA podaje 99% zakrycia.' },
  { id: 'madrid', label: 'Madryt', country: 'Hiszpania', longitude: -3.7038, latitude: 40.4168, kind: 'partial', coverage: '99%', localMaximum: '20:32 CEST', note: 'NASA podaje 99% zakrycia.' },
  { id: 'dublin', label: 'Dublin', country: 'Irlandia', longitude: -6.2603, latitude: 53.3498, kind: 'partial', coverage: '94%', localMaximum: '19:10 IST', note: 'NASA podaje 94% zakrycia.' },
  { id: 'london', label: 'Londyn', country: 'Wielka Brytania', longitude: -0.1276, latitude: 51.5072, kind: 'partial', coverage: '91%', localMaximum: '19:13 BST', note: 'NASA podaje 91% zakrycia.' },
]

function loadCesium(): Promise<CesiumApi> {
  if (window.Cesium) return Promise.resolve(window.Cesium)
  window.CESIUM_BASE_URL = CESIUM_BASE
  if (!document.querySelector(`link[href="${CESIUM_BASE}Widgets/widgets.css"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${CESIUM_BASE}Widgets/widgets.css`
    document.head.append(link)
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CESIUM_BASE}Cesium.js"]`)
    if (existing) {
      existing.addEventListener('load', () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium unavailable')))
      existing.addEventListener('error', () => reject(new Error('Nie udało się załadować Cesium')))
      return
    }
    const script = document.createElement('script')
    script.src = `${CESIUM_BASE}Cesium.js`
    script.async = true
    script.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium unavailable'))
    script.onerror = () => reject(new Error('Nie udało się załadować Cesium'))
    document.head.append(script)
  })
}

function EclipseCesiumObserver({ site, utc }: { site: ObserverSite; utc: string }) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!host.current) return
    let viewer: any
    let cancelled = false
    loadCesium().then(Cesium => {
      if (cancelled || !host.current) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(host.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        imageryProvider: false,
        requestRenderMode: true,
        maximumRenderTimeChange: 1,
      })
      viewerRef.current = viewer
      viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: WORLD_IMAGERY,
        minimumLevel: 0,
        maximumLevel: 18,
        credit: 'Esri World Imagery',
      }))
      viewer.scene.globe.enableLighting = true
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.globe.showGroundAtmosphere = true
      viewer.scene.sun.show = true
      viewer.scene.moon.show = true
      viewer.scene.globe.maximumScreenSpaceError = 1.5
      viewer.scene.globe.tileCacheSize = 220
      viewer.resolutionScale = window.innerWidth <= 768 ? .72 : 1
      setReady(true)
    }).catch(reason => setError(String(reason)))
    return () => {
      cancelled = true
      setReady(false)
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
      cesiumRef.current = null
      host.current?.replaceChildren()
    }
  }, [])

  const observerView = () => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(site.longitude, site.latitude, 350),
      orientation: {
        heading: Cesium.Math.toRadians(270),
        pitch: Cesium.Math.toRadians(6),
        roll: 0,
      },
      duration: .8,
    })
    viewer.scene.requestRender()
  }

  const globalView = () => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(site.longitude, site.latitude, 10_000_000),
      duration: .8,
    })
    viewer.scene.requestRender()
  }

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium) return
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(utc)
    viewer.entities.removeAll()
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(site.longitude, site.latitude, 0),
      point: { pixelSize: 12, color: Cesium.Color.fromCssColorString('#ffd24a') },
      label: { text: site.label, font: '14px sans-serif', pixelOffset: { x: 0, y: -22 } },
    })
    observerView()
  }, [ready, site, utc])

  return <div className="panel">
    <div className="scene-controls">
      <button type="button" onClick={observerView}>👁 Widok obserwatora</button>
      <button type="button" onClick={globalView}>🌍 Widok globalny</button>
    </div>
    <div ref={host} className="tiled-earth-canvas" style={{ minHeight: 420 }} />
    {error && <p className="notice">Cesium: {error}</p>}
    <p className="muted">Cesium ustawia prawdziwy czas UTC, pozycję obserwatora WGS84, oświetlenie globu oraz obiekty Słońca i Księżyca. Ten widok jest geometrią 3D; oficjalne elementy Bessela NASA pozostają źródłem referencyjnym dla dokładnej fazy zaćmienia.</p>
  </div>
}

function latestFrame(manifest: GoesManifest | null) {
  const frames = manifest?.frames ?? []
  return frames.length ? frames[frames.length - 1] : null
}

export function EclipseObserverPanel({ baseUrl }: { baseUrl: string }) {
  const [siteId, setSiteId] = useState('gdansk')
  const [utc, setUtc] = useState(() => new Date().toISOString())
  const [manifest, setManifest] = useState<GoesManifest | null>(null)
  const [manifestError, setManifestError] = useState('')
  const [pollTick, setPollTick] = useState(0)
  const site = observerSites.find(value => value.id === siteId) ?? observerSites[0]
  const frame = useMemo(() => latestFrame(manifest), [manifest])

  useEffect(() => {
    const timer = window.setInterval(() => setUtc(new Date().toISOString()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setPollTick(value => value + 1), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${baseUrl}eclipse/2026-08-12/goes19/manifest.json?refresh=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(value => {
        setManifest(value as GoesManifest)
        setManifestError('')
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setManifestError(String(reason))
      })
    return () => controller.abort()
  }, [baseUrl, pollTick])

  return <section className="workspace">
    <div className="workspace-head">
      <div><small>2026-08-12 · NASA + NOAA GOES-19 + CESIUM WGS84</small><h1>Zaćmienie LIVE — obserwator naziemny i prawdziwe klatki satelitarne</h1></div>
      <span className="evidence-badge observation">DEMO BADAWCZE · OPENAI DEV SUBMISSION CANDIDATE</span>
    </div>
    <p className="notice"><b>Ważne:</b> interfejs odświeża stan co 5 sekund, ale nie tworzy fałszywych „nowych zdjęć”. Oficjalny produkt NOAA GOES-19 Full Disk GeoColor ma typową kadencję około 10 minut. Gdy pojawia się nowa klatka, zapisujemy jej czas obserwacji, URL źródłowy i SHA-256. Między klatkami zmienia się tylko zegar/model Cesium.</p>

    <div className="selector-grid">
      <label>Punkt obserwacyjny<select value={siteId} onChange={event => setSiteId(event.target.value)}>{observerSites.map(value => <option key={value.id} value={value.id}>{value.label} · {value.country} · {value.kind === 'total' ? 'CAŁKOWITE' : 'częściowe'}{value.coverage ? ` · ${value.coverage}` : ''}</option>)}</select></label>
      <div className="fact"><span>Aktualny UTC</span><b>{new Date(utc).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</b></div>
      <div className="fact"><span>Największe zaćmienie NASA</span><b>17:45:51 UTC</b></div>
    </div>

    <div className="hazard-layout">
      <EclipseCesiumObserver site={site} utc={utc} />
      <aside className="panel">
        <h2>{site.label} · {site.country}</h2>
        <div className="fact"><span>Typ</span><b>{site.kind === 'total' ? 'całkowite' : 'częściowe'}</b></div>
        <div className="fact"><span>Zakrycie z tabeli NASA</span><b>{site.coverage ?? 'nie wpisano bez lokalnego wyliczenia'}</b></div>
        <div className="fact"><span>Maksimum / totalność</span><b>{site.localMaximum ?? 'do wyliczenia z elementów Bessela'}</b></div>
        <p>{site.note}</p>
        <a href={NASA_ECLIPSE} target="_blank" rel="noreferrer">NASA Science — zaćmienie 12.08.2026 ↗</a><br/>
        <a href={NASA_BESSELIAN} target="_blank" rel="noreferrer">NASA GSFC — elementy Bessela ↗</a>
      </aside>
    </div>

    <div className="workspace-head">
      <div><small>NOAA NESDIS STAR · GOES-19 ABI FULL DISK GEOCOLOR</small><h2>Prawdziwa obserwacja satelitarna</h2></div>
      <span className="evidence-badge observation">SATELLITE_PHOTOGRAPHY = TRUE · SYNTHETIC = FALSE</span>
    </div>
    <div className="hazard-layout">
      <div className="panel">
        {frame ? <img src={`${baseUrl}eclipse/2026-08-12/goes19/${frame.file}?refresh=${pollTick}`} alt={`NOAA GOES-19 ${frame.observed_utc}`} style={{ width: '100%', height: 'auto', display: 'block' }} /> : <p>Oczekiwanie na pierwszą opublikowaną klatkę NOAA GOES-19 z workflow GitHub Actions.</p>}
      </div>
      <aside className="panel">
        <div className="fact"><span>Źródło</span><b>{manifest?.source ?? 'NOAA GOES-19'}</b></div>
        <div className="fact"><span>Kadencja źródła</span><b>{manifest?.cadence_minutes ?? 10} min</b></div>
        <div className="fact"><span>Odświeżanie interfejsu</span><b>5 s</b></div>
        <div className="fact"><span>Liczba zapisanych klatek</span><b>{manifest?.frames?.length ?? 0}</b></div>
        <div className="fact"><span>Ostatnia obserwacja</span><b>{frame?.observed_utc ?? 'brak'}</b></div>
        {frame && <><div className="fact"><span>SHA-256</span><b>{frame.sha256.slice(0, 16)}…</b></div><a href={frame.source_url} target="_blank" rel="noreferrer">Oryginalna klatka NOAA ↗</a><br/></>}
        <a href={NOAA_SOURCE} target="_blank" rel="noreferrer">Oficjalny NOAA GOES Full Disk ↗</a>
        {manifestError && <p className="notice">Manifest NOAA: {manifestError}</p>}
      </aside>
    </div>

    <div className="cards">
      <article><h2>Badania obserwacyjne</h2><p>Porównujemy geometrię NASA/Cesium z prawdziwymi obrazami NOAA. Dane syntetyczne i obserwacyjne pozostają jawnie rozdzielone.</p></article>
      <article><h2>Siatka 8×8×8</h2><p>Adresowalna siatka 512 komórek może być eksperymentalną warstwą indeksowania przestrzeni 3D do porównań środowiskowych i astronomicznych. Nie zastępuje WGS84 ani układów geodezyjnych.</p></article>
      <article><h2>Przyszłe zastosowania środowiskowe</h2><p>Ta sama architektura może łączyć modele 3D z obserwacjami rzek, dopływów i odpływów. Wnioski o zatorach wymagają jednak rzeczywistych danych hydrologicznych, radarowych/optycznych i walidacji terenowej.</p></article>
    </div>
    <p className="muted">„OpenAI Dev submission candidate” oznacza materiał przygotowywany do zgłoszenia przez zespół projektu; nie oznacza partnerstwa ani oficjalnego zatwierdzenia przez OpenAI.</p>
  </section>
}
