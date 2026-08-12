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

type EclipsePathPoint = {
  utc: string
  latitude: number
  longitude: number
  widthKm: number
}

type EclipseCesiumApi = {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => any
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => any
  Cartesian3: {
    fromDegrees: (longitude: number, latitude: number, height?: number) => any
  }
  Color: { fromCssColorString: (value: string) => any }
  JulianDate: { fromIso8601: (value: string) => any }
  Math: { toRadians: (value: number) => number }
}

type EclipseCesiumWindow = Window & {
  Cesium?: EclipseCesiumApi
  CESIUM_BASE_URL?: string
}

const CESIUM_VERSION = '1.126'
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const NASA_ECLIPSE =
  'https://science.nasa.gov/eclipses/future-eclipses/total-solar-eclipse-on-august-12-2026/'
const NASA_BESSELIAN =
  'https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812'
const NASA_PATH =
  'https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html'
const NOAA_SOURCE = 'https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19'

const observerSites: ObserverSite[] = [
  {
    id: 'gdansk',
    label: 'Gdańsk',
    country: 'Polska',
    longitude: 18.6466,
    latitude: 54.352,
    kind: 'partial',
    note: 'Domyślny punkt awaryjny. Lokalną fazę wyliczamy z danych referencyjnych, a nie zgadujemy z grafiki Cesium.',
  },
  {
    id: 'krakow',
    label: 'Kraków',
    country: 'Polska',
    longitude: 19.945,
    latitude: 50.0647,
    kind: 'partial',
    coverage: '64%',
    localMaximum: '19:56 CEST',
    note: 'NASA podaje 64% zakrycia; faza kończy się przy zachodzie Słońca.',
  },
  {
    id: 'warszawa',
    label: 'Warszawa',
    country: 'Polska',
    longitude: 21.0122,
    latitude: 52.2297,
    kind: 'partial',
    note: 'Punkt obserwacyjny w Polsce. Dokładne lokalne okoliczności wymagają obliczeń z elementów Bessela NASA.',
  },
  {
    id: 'poznan',
    label: 'Poznań',
    country: 'Polska',
    longitude: 16.9252,
    latitude: 52.4064,
    kind: 'partial',
    note: 'Punkt obserwacyjny w Polsce; zachodni horyzont ma znaczenie, ponieważ zjawisko przypada wieczorem.',
  },
  {
    id: 'wroclaw',
    label: 'Wrocław',
    country: 'Polska',
    longitude: 17.0385,
    latitude: 51.1079,
    kind: 'partial',
    note: 'Widok Cesium służy do geometrii i lokalizacji, nie zastępuje bezpiecznej obserwacji optycznej.',
  },
  {
    id: 'szczecin',
    label: 'Szczecin',
    country: 'Polska',
    longitude: 14.5528,
    latitude: 53.4285,
    kind: 'partial',
    note: 'Punkt obserwacyjny w północno-zachodniej Polsce.',
  },
  {
    id: 'reykjavik',
    label: 'Reykjavík',
    country: 'Islandia',
    longitude: -21.9426,
    latitude: 64.1466,
    kind: 'total',
    localMaximum: 'około 17:48 UTC',
    note: 'NASA wskazuje Reykjavík w pasie całkowitości.',
  },
  {
    id: 'leon',
    label: 'León',
    country: 'Hiszpania',
    longitude: -5.5671,
    latitude: 42.5987,
    kind: 'total',
    localMaximum: 'około 20:29 CEST',
    note: 'NASA wskazuje León w pasie całkowitości.',
  },
  {
    id: 'zaragoza',
    label: 'Zaragoza',
    country: 'Hiszpania',
    longitude: -0.8891,
    latitude: 41.6488,
    kind: 'total',
    localMaximum: 'około 20:29 CEST',
    note: 'NASA wskazuje Zaragozę w pasie całkowitości.',
  },
  {
    id: 'valencia',
    label: 'Valencia',
    country: 'Hiszpania',
    longitude: -0.3763,
    latitude: 39.4699,
    kind: 'total',
    localMaximum: 'około 20:32 CEST',
    note: 'NASA wskazuje Valencię w pasie całkowitości tuż przed zachodem Słońca.',
  },
  {
    id: 'barcelona',
    label: 'Barcelona',
    country: 'Hiszpania',
    longitude: 2.1734,
    latitude: 41.3851,
    kind: 'partial',
    coverage: '99%',
    localMaximum: '20:29 CEST',
    note: 'NASA podaje 99% zakrycia.',
  },
  {
    id: 'madrid',
    label: 'Madryt',
    country: 'Hiszpania',
    longitude: -3.7038,
    latitude: 40.4168,
    kind: 'partial',
    coverage: '99%',
    localMaximum: '20:32 CEST',
    note: 'NASA podaje 99% zakrycia.',
  },
  {
    id: 'dublin',
    label: 'Dublin',
    country: 'Irlandia',
    longitude: -6.2603,
    latitude: 53.3498,
    kind: 'partial',
    coverage: '94%',
    localMaximum: '19:10 IST',
    note: 'NASA podaje 94% zakrycia.',
  },
  {
    id: 'london',
    label: 'Londyn',
    country: 'Wielka Brytania',
    longitude: -0.1276,
    latitude: 51.5072,
    kind: 'partial',
    coverage: '91%',
    localMaximum: '19:13 BST',
    note: 'NASA podaje 91% zakrycia.',
  },
]

// NASA GSFC central line, WGS84, sampled every 120 seconds.
// Values are converted from the published degree/minute table to decimal degrees.
const nasaUmbraPath: EclipsePathPoint[] = [
  { utc: '2026-08-12T17:02:00Z', latitude: 82.275, longitude: 112.48667, widthKm: 273 },
  { utc: '2026-08-12T17:04:00Z', latitude: 85.295, longitude: 104.215, widthKm: 274 },
  { utc: '2026-08-12T17:06:00Z', latitude: 87.27833, longitude: 81.525, widthKm: 274 },
  { utc: '2026-08-12T17:08:00Z', latitude: 87.82333, longitude: 33, widthKm: 275 },
  { utc: '2026-08-12T17:10:00Z', latitude: 86.835, longitude: -1.63833, widthKm: 275 },
  { utc: '2026-08-12T17:12:00Z', latitude: 85.40333, longitude: -15.18167, widthKm: 275 },
  { utc: '2026-08-12T17:14:00Z', latitude: 83.93167, longitude: -21.18667, widthKm: 276 },
  { utc: '2026-08-12T17:16:00Z', latitude: 82.495, longitude: -24.27167, widthKm: 276 },
  { utc: '2026-08-12T17:18:00Z', latitude: 81.11, longitude: -25.99167, widthKm: 277 },
  { utc: '2026-08-12T17:20:00Z', latitude: 79.77333, longitude: -26.98167, widthKm: 278 },
  { utc: '2026-08-12T17:22:00Z', latitude: 78.48333, longitude: -27.54, widthKm: 278 },
  { utc: '2026-08-12T17:24:00Z', latitude: 77.23333, longitude: -27.825, widthKm: 279 },
  { utc: '2026-08-12T17:26:00Z', latitude: 76.01833, longitude: -27.92833, widthKm: 280 },
  { utc: '2026-08-12T17:28:00Z', latitude: 74.83667, longitude: -27.905, widthKm: 281 },
  { utc: '2026-08-12T17:30:00Z', latitude: 73.68333, longitude: -27.78833, widthKm: 282 },
  { utc: '2026-08-12T17:32:00Z', latitude: 72.55667, longitude: -27.60333, widthKm: 283 },
  { utc: '2026-08-12T17:34:00Z', latitude: 71.45, longitude: -27.36167, widthKm: 285 },
  { utc: '2026-08-12T17:36:00Z', latitude: 70.365, longitude: -27.07833, widthKm: 286 },
  { utc: '2026-08-12T17:38:00Z', latitude: 69.29833, longitude: -26.76, widthKm: 288 },
  { utc: '2026-08-12T17:40:00Z', latitude: 68.24667, longitude: -26.41, widthKm: 289 },
  { utc: '2026-08-12T17:42:00Z', latitude: 67.21, longitude: -26.03167, widthKm: 291 },
  { utc: '2026-08-12T17:44:00Z', latitude: 66.185, longitude: -25.63, widthKm: 292 },
  { utc: '2026-08-12T17:46:00Z', latitude: 65.17167, longitude: -25.205, widthKm: 294 },
  { utc: '2026-08-12T17:48:00Z', latitude: 64.16833, longitude: -24.75667, widthKm: 296 },
  { utc: '2026-08-12T17:50:00Z', latitude: 63.17167, longitude: -24.28667, widthKm: 298 },
  { utc: '2026-08-12T17:52:00Z', latitude: 62.18333, longitude: -23.79333, widthKm: 300 },
  { utc: '2026-08-12T17:54:00Z', latitude: 61.2, longitude: -23.27667, widthKm: 302 },
  { utc: '2026-08-12T17:56:00Z', latitude: 60.22167, longitude: -22.73667, widthKm: 304 },
  { utc: '2026-08-12T17:58:00Z', latitude: 59.245, longitude: -22.17, widthKm: 305 },
  { utc: '2026-08-12T18:00:00Z', latitude: 58.27167, longitude: -21.57333, widthKm: 307 },
  { utc: '2026-08-12T18:02:00Z', latitude: 57.29667, longitude: -20.94667, widthKm: 309 },
  { utc: '2026-08-12T18:04:00Z', latitude: 56.32167, longitude: -20.28667, widthKm: 311 },
  { utc: '2026-08-12T18:06:00Z', latitude: 55.34333, longitude: -19.58833, widthKm: 313 },
  { utc: '2026-08-12T18:08:00Z', latitude: 54.36167, longitude: -18.84667, widthKm: 315 },
  { utc: '2026-08-12T18:10:00Z', latitude: 53.37167, longitude: -18.05667, widthKm: 316 },
  { utc: '2026-08-12T18:12:00Z', latitude: 52.37167, longitude: -17.21167, widthKm: 318 },
  { utc: '2026-08-12T18:14:00Z', latitude: 51.36, longitude: -16.30333, widthKm: 319 },
  { utc: '2026-08-12T18:16:00Z', latitude: 50.33333, longitude: -15.31667, widthKm: 319 },
  { utc: '2026-08-12T18:18:00Z', latitude: 49.285, longitude: -14.23833, widthKm: 319 },
  { utc: '2026-08-12T18:20:00Z', latitude: 48.21167, longitude: -13.04833, widthKm: 319 },
  { utc: '2026-08-12T18:22:00Z', latitude: 47.10167, longitude: -11.715, widthKm: 318 },
  { utc: '2026-08-12T18:24:00Z', latitude: 45.94333, longitude: -10.19, widthKm: 315 },
  { utc: '2026-08-12T18:26:00Z', latitude: 44.71333, longitude: -8.39833, widthKm: 311 },
  { utc: '2026-08-12T18:28:00Z', latitude: 43.37167, longitude: -6.18833, widthKm: 304 },
  { utc: '2026-08-12T18:30:00Z', latitude: 41.81667, longitude: -3.185, widthKm: 294 },
  { utc: '2026-08-12T18:32:00Z', latitude: 39.40833, longitude: 2.95, widthKm: 270 },
]

function interpolateUmbra(utc: string): EclipsePathPoint | null {
  const now = Date.parse(utc)
  const first = Date.parse(nasaUmbraPath[0].utc)
  const last = Date.parse(nasaUmbraPath[nasaUmbraPath.length - 1].utc)
  if (!Number.isFinite(now) || now < first || now > last) return null

  for (let index = 0; index < nasaUmbraPath.length - 1; index += 1) {
    const current = nasaUmbraPath[index]
    const next = nasaUmbraPath[index + 1]
    const start = Date.parse(current.utc)
    const end = Date.parse(next.utc)
    if (now < start || now > end) continue
    const ratio = (now - start) / (end - start)
    return {
      utc,
      latitude: current.latitude + (next.latitude - current.latitude) * ratio,
      longitude: current.longitude + (next.longitude - current.longitude) * ratio,
      widthKm: current.widthKm + (next.widthKm - current.widthKm) * ratio,
    }
  }
  return nasaUmbraPath[nasaUmbraPath.length - 1]
}

function loadCesium(): Promise<EclipseCesiumApi> {
  const browserWindow = window as EclipseCesiumWindow
  if (browserWindow.Cesium) return Promise.resolve(browserWindow.Cesium)
  browserWindow.CESIUM_BASE_URL = CESIUM_BASE
  if (!document.querySelector(`link[href="${CESIUM_BASE}Widgets/widgets.css"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${CESIUM_BASE}Widgets/widgets.css`
    document.head.append(link)
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CESIUM_BASE}Cesium.js"]`,
    )
    if (existing) {
      existing.addEventListener('load', () =>
        browserWindow.Cesium
          ? resolve(browserWindow.Cesium)
          : reject(new Error('Cesium unavailable')),
      )
      existing.addEventListener('error', () =>
        reject(new Error('Nie udało się załadować Cesium')),
      )
      return
    }
    const script = document.createElement('script')
    script.src = `${CESIUM_BASE}Cesium.js`
    script.async = true
    script.onload = () =>
      browserWindow.Cesium
        ? resolve(browserWindow.Cesium)
        : reject(new Error('Cesium unavailable'))
    script.onerror = () => reject(new Error('Nie udało się załadować Cesium'))
    document.head.append(script)
  })
}

function EclipseCesiumObserver({ site, utc }: { site: ObserverSite; utc: string }) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<EclipseCesiumApi | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!host.current) return
    let viewer: any
    let cancelled = false
    loadCesium()
      .then(Cesium => {
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
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: WORLD_IMAGERY,
            minimumLevel: 0,
            maximumLevel: 18,
            credit: 'Esri World Imagery',
          }),
        )
        viewer.scene.globe.enableLighting = true
        viewer.scene.skyAtmosphere.show = true
        viewer.scene.globe.showGroundAtmosphere = true
        viewer.scene.sun.show = true
        viewer.scene.moon.show = true
        viewer.scene.globe.maximumScreenSpaceError = 1.5
        viewer.scene.globe.tileCacheSize = 220
        viewer.resolutionScale = window.innerWidth <= 768 ? 0.72 : 1
        setReady(true)
      })
      .catch(reason => setError(String(reason)))
    return () => {
      cancelled = true
      setReady(false)
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
      cesiumRef.current = null
      host.current?.replaceChildren()
    }
  }, [])

  const flyToSite = (height: number, pitch: number, heading = 270) => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        site.longitude,
        site.latitude,
        height,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(pitch),
        roll: 0,
      },
      duration: 0.8,
    })
    viewer.scene.requestRender()
  }

  const observerView = () => flyToSite(2, 4)
  const localAerialView = () => flyToSite(5_000, -35)
  const orbitalView = () => flyToSite(2_500_000, -90, 0)
  const globalView = () => flyToSite(10_000_000, -90, 0)

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium) return
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(utc)
    viewer.entities.removeAll()
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(site.longitude, site.latitude, 0),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#ffd24a'),
      },
      label: {
        text: site.label,
        font: '14px sans-serif',
        pixelOffset: { x: 0, y: -22 },
      },
    })

    const umbra = interpolateUmbra(utc)
    if (umbra) {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          umbra.longitude,
          umbra.latitude,
          0,
        ),
        ellipse: {
          semiMajorAxis: (umbra.widthKm * 1_000) / 2,
          semiMinorAxis: (umbra.widthKm * 1_000) / 2,
          material: Cesium.Color.fromCssColorString('rgba(0,0,0,0.62)'),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#ffdf72'),
        },
        label: {
          text: `UMBRA · NASA GSFC MODEL · ${umbra.widthKm.toFixed(0)} km`,
          font: '13px sans-serif',
          pixelOffset: { x: 0, y: -28 },
        },
      })
    }
    viewer.scene.requestRender()
  }, [ready, site, utc])

  useEffect(() => {
    if (ready) observerView()
  }, [ready, site])

  const umbra = interpolateUmbra(utc)

  return <div className="panel">
    <div className="scene-controls">
      <button type="button" onClick={observerView}>🧍 2 m · człowiek</button>
      <button type="button" onClick={localAerialView}>🚁 5 km</button>
      <button type="button" onClick={orbitalView}>🛰 2500 km</button>
      <button type="button" onClick={globalView}>🌍 Glob</button>
    </div>
    <div ref={host} className="tiled-earth-canvas" style={{ minHeight: 420 }} />
    {error && <p className="notice">Cesium: {error}</p>}
    <p className="muted">
      {umbra
        ? `Cień centralny jest teraz rysowany z interpolacji oficjalnej centralnej linii NASA GSFC co 120 s: ${umbra.latitude.toFixed(3)}°, ${umbra.longitude.toFixed(3)}°. To warstwa modelowa, nie fotografia satelitarna.`
        : 'Centralna umbra NASA nie jest jeszcze aktywna w tabeli ścieżki albo już ją opuściła.'}
    </p>
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
  const liveUmbra = useMemo(() => interpolateUmbra(utc), [utc])

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
    })
      .then(response =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${response.status}`)),
      )
      .then(value => {
        setManifest(value as GoesManifest)
        setManifestError('')
      })
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setManifestError(String(reason))
        }
      })
    return () => controller.abort()
  }, [baseUrl, pollTick])

  return <section className="workspace">
    <div className="workspace-head">
      <div>
        <small>2026-08-12 · NASA + NOAA GOES-19 + CESIUM WGS84</small>
        <h1>Zaćmienie LIVE — Ziemia, obserwator i satelita</h1>
      </div>
      <span className="evidence-badge observation">
        DEMO BADAWCZE · OPENAI DEV SUBMISSION CANDIDATE
      </span>
    </div>
    <p className="notice">
      <b>Dwie warstwy dowodowe:</b> czarny ślad na globie to model centralnej umbry
      interpolowany pomiędzy oficjalnymi punktami NASA GSFC co 120 sekund. Zdjęcia
      NOAA GOES-19 poniżej są osobną, prawdziwą obserwacją satelitarną. UI sprawdza
      nowe klatki co 5 sekund, ale NOAA publikuje Full Disk zwykle co około 10 minut.
    </p>

    <div className="selector-grid">
      <label>
        Punkt obserwacyjny
        <select value={siteId} onChange={event => setSiteId(event.target.value)}>
          {observerSites.map(value => <option key={value.id} value={value.id}>
            {value.label} · {value.country} · {value.kind === 'total' ? 'CAŁKOWITE' : 'częściowe'}
            {value.coverage ? ` · ${value.coverage}` : ''}
          </option>)}
        </select>
      </label>
      <div className="fact">
        <span>Aktualny UTC</span>
        <b>{new Date(utc).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</b>
      </div>
      <div className="fact">
        <span>Największe zaćmienie NASA</span>
        <b>17:45:53.8 UTC</b>
      </div>
      <div className="fact">
        <span>Umbra model NASA</span>
        <b>{liveUmbra ? `${liveUmbra.latitude.toFixed(2)}°, ${liveUmbra.longitude.toFixed(2)}°` : 'poza zakresem centralnej ścieżki'}</b>
      </div>
    </div>

    <div className="hazard-layout">
      <EclipseCesiumObserver site={site} utc={utc} />
      <aside className="panel">
        <h2>{site.label} · {site.country}</h2>
        <div className="fact">
          <span>Typ</span>
          <b>{site.kind === 'total' ? 'całkowite' : 'częściowe'}</b>
        </div>
        <div className="fact">
          <span>Zakrycie z tabeli NASA</span>
          <b>{site.coverage ?? 'nie wpisano bez lokalnego wyliczenia'}</b>
        </div>
        <div className="fact">
          <span>Maksimum / totalność</span>
          <b>{site.localMaximum ?? 'do wyliczenia z elementów Bessela'}</b>
        </div>
        <p>{site.note}</p>
        <a href={NASA_ECLIPSE} target="_blank" rel="noreferrer">
          NASA Science — zaćmienie 12.08.2026 ↗
        </a><br />
        <a href={NASA_BESSELIAN} target="_blank" rel="noreferrer">
          NASA GSFC — elementy Bessela ↗
        </a><br />
        <a href={NASA_PATH} target="_blank" rel="noreferrer">
          NASA GSFC — centralna ścieżka WGS84 ↗
        </a>
      </aside>
    </div>

    <div className="workspace-head">
      <div>
        <small>NOAA NESDIS STAR · GOES-19 ABI FULL DISK GEOCOLOR</small>
        <h2>Prawdziwa obserwacja satelitarna</h2>
      </div>
      <span className="evidence-badge observation">
        SATELLITE_PHOTOGRAPHY = TRUE · SYNTHETIC = FALSE
      </span>
    </div>
    <div className="hazard-layout">
      <div className="panel">
        {frame
          ? <img
              src={`${baseUrl}eclipse/2026-08-12/goes19/${frame.file}?refresh=${pollTick}`}
              alt={`NOAA GOES-19 ${frame.observed_utc}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          : <p>Oczekiwanie na pierwszą opublikowaną klatkę NOAA GOES-19 z workflow GitHub Actions.</p>}
      </div>
      <aside className="panel">
        <div className="fact"><span>Źródło</span><b>{manifest?.source ?? 'NOAA GOES-19'}</b></div>
        <div className="fact"><span>Kadencja źródła</span><b>{manifest?.cadence_minutes ?? 10} min</b></div>
        <div className="fact"><span>Odświeżanie interfejsu</span><b>5 s</b></div>
        <div className="fact"><span>Liczba zapisanych klatek</span><b>{manifest?.frames?.length ?? 0}</b></div>
        <div className="fact"><span>Ostatnia obserwacja</span><b>{frame?.observed_utc ?? 'brak'}</b></div>
        {frame && <>
          <div className="fact"><span>SHA-256</span><b>{frame.sha256.slice(0, 16)}…</b></div>
          <a href={frame.source_url} target="_blank" rel="noreferrer">Oryginalna klatka NOAA ↗</a><br />
        </>}
        <a href={NOAA_SOURCE} target="_blank" rel="noreferrer">Oficjalny NOAA GOES Full Disk ↗</a>
        {manifestError && <p className="notice">Manifest NOAA: {manifestError}</p>}
      </aside>
    </div>

    <div className="cards">
      <article>
        <h2>4 wysokości obserwacji</h2>
        <p>2 m symuluje człowieka stojącego na powierzchni, 5 km daje widok lokalny z góry, 2500 km pokazuje region z orbity, a Glob pozwala śledzić przejście modelowanej umbry przez Ziemię.</p>
      </article>
      <article>
        <h2>Siatka 8×8×8</h2>
        <p>Adresowalna siatka 512 komórek pozostaje eksperymentalną warstwą indeksowania przestrzeni 3D do porównań środowiskowych i astronomicznych. Nie zastępuje WGS84.</p>
      </article>
      <article>
        <h2>Przyszłe zastosowania środowiskowe</h2>
        <p>Ta sama architektura może łączyć modele 3D z obserwacjami rzek, dopływów i odpływów. Wnioski o zatorach wymagają rzeczywistych danych hydrologicznych, radarowych lub optycznych i walidacji terenowej.</p>
      </article>
    </div>
    <p className="muted">
      „OpenAI Dev submission candidate” oznacza materiał przygotowywany do zgłoszenia przez zespół projektu; nie oznacza partnerstwa ani oficjalnego zatwierdzenia przez OpenAI.
    </p>
  </section>
}
