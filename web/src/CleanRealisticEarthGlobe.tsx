import { useEffect, useMemo, useRef, useState } from 'react'
import './location-globe.css'
import './tiled-earth.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[] }
type ViewMode = 'globe' | 'north' | 'south'
type Layer = 'high-resolution' | 'realtime-clouds' | 'nasa-day' | 'nasa-night' | 'copernicus-safe'
type Sensor = 'sentinel-1-grd' | 'sentinel-2-l2a' | 'sentinel-3-olci-l1b'
type StacItem = { id: string; bbox?: number[]; properties?: Record<string, unknown>; assets?: Record<string, { href?: string; type?: string }>; links?: Array<{ rel?: string; href?: string }> }
type CesiumApi = {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => any
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => any
  WebMapTileServiceImageryProvider: new (options: Record<string, unknown>) => any
  WebMapServiceImageryProvider: new (options: Record<string, unknown>) => any
  Cartesian3: { fromDegrees: (longitude: number, latitude: number, height?: number) => any }
  Rectangle: { fromDegrees: (west: number, south: number, east: number, north: number) => any }
  Color: { fromCssColorString: (value: string) => any; BLACK: any }
  HeightReference: { CLAMP_TO_GROUND: any }
  JulianDate: { fromIso8601: (value: string) => any }
}

declare global { interface Window { Cesium?: CesiumApi; CESIUM_BASE_URL?: string } }

const CESIUM_VERSION = '1.126'
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const HIGH_RESOLUTION_WORLD = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const NASA_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
const STAC_SEARCH = 'https://stac.dataspace.copernicus.eu/v1/search'
const CDSE_INSTANCE = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${CDSE_INSTANCE}`
const TEN_MINUTES = 10 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function floorToTenMinutes(value: Date) {
  return new Date(Math.floor(value.getTime() / TEN_MINUTES) * TEN_MINUTES)
}

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

function assetUrl(item?: StacItem) {
  if (!item) return ''
  for (const key of ['visual', 'rendered_preview', 'thumbnail', 'overview', 'preview', 'quicklook']) {
    if (item.assets?.[key]?.href) return item.assets[key].href ?? ''
  }
  return Object.values(item.assets ?? {}).find(asset => asset.href && asset.type?.startsWith('image/'))?.href ?? ''
}

function PolarScene({ mode, date }: { mode: 'north' | 'south'; date: Date }) {
  const [sensor, setSensor] = useState<Sensor>('sentinel-2-l2a')
  const [items, setItems] = useState<StacItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const selected = items.find(item => item.id === selectedId) ?? items[0]
  const image = assetUrl(selected)
  const day = date.toISOString().slice(0, 10)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    fetch(STAC_SEARCH, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collections: [sensor], bbox: mode === 'north' ? [-180, 72, 180, 90] : [-180, -90, 180, -72], datetime: `${day}T00:00:00Z/${day}T23:59:59Z`, limit: 50 }),
      signal: controller.signal,
    }).then(response => response.ok ? response.json() : Promise.reject(new Error(`STAC ${response.status}`)))
      .then(data => {
        const found = Array.isArray(data.features) ? data.features as StacItem[] : []
        setItems(found)
        setSelectedId(found[0]?.id ?? '')
        if (!found.length) setError('Brak pojedynczej sceny dla tego dnia. Zmień datę lub sensor.')
      }).catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(String(reason))
      })
    return () => controller.abort()
  }, [mode, sensor, day])

  return <div className="original-scene-module">
    <div className="scene-controls">
      <label>Sensor<select value={sensor} onChange={event => setSensor(event.target.value as Sensor)}>
        <option value="sentinel-2-l2a">Sentinel-2 — prawdziwy kolor</option><option value="sentinel-1-grd">Sentinel-1 — radar</option><option value="sentinel-3-olci-l1b">Sentinel-3 — szeroki obraz</option>
      </select></label>
      <label>Oryginalny produkt<select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>{items.map(item => <option key={item.id}>{item.id}</option>)}</select></label>
      <button type="button" onClick={() => setZoom(value => Math.min(12, value * 1.35))}>+</button><button type="button" onClick={() => setZoom(value => Math.max(.5, value / 1.35))}>−</button><button type="button" onClick={() => setZoom(1)}>Reset</button>
    </div>
    <div className="scene-status"><strong>{mode === 'north' ? 'Arktyka' : 'Antarktyda'} — autentyczna scena satelitarna</strong><span>Bez sztucznej kuli i bez generowania brakujących pikseli.</span></div>
    <div className="scene-layout"><div className="scene-canvas">{error && <div className="scene-message scene-error">{error}</div>}{selected && image && <div className="scene-image-frame" style={{ transform: `scale(${zoom})` }}><img src={image} alt={selected.id} /></div>}{selected && !image && !error && <div className="scene-message">Produkt istnieje, ale katalog nie udostępnia publicznego podglądu.</div>}</div>
      <aside className="scene-metadata"><h3>Metadane</h3><p><b>ID:</b> {selected?.id ?? 'brak'}</p><p><b>Czas:</b> {String(selected?.properties?.datetime ?? 'brak')}</p><p><b>BBOX:</b> {selected?.bbox?.join(', ') ?? 'brak'}</p>{selected && <a className="scene-product-link" href={selected.links?.find(link => link.rel === 'self')?.href ?? 'https://browser.dataspace.copernicus.eu/'} target="_blank" rel="noreferrer">Otwórz oryginalny produkt</a>}</aside>
    </div>
  </div>
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewMode>('globe')
  const [layer, setLayer] = useState<Layer>('realtime-clouds')
  const [nightVision, setNightVision] = useState(false)
  const [live, setLive] = useState(true)
  const [solarLighting, setSolarLighting] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [frameIndex, setFrameIndex] = useState(1008)
  const [cloudOpacity, setCloudOpacity] = useState(.88)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [error, setError] = useState('')
  const animationEnd = useMemo(() => floorToTenMinutes(new Date(nowTick)), [nowTick])
  const animationStart = useMemo(() => new Date(animationEnd.getTime() - SEVEN_DAYS), [animationEnd])
  const animatedDate = useMemo(() => new Date(animationStart.getTime() + frameIndex * TEN_MINUTES), [animationStart, frameIndex])
  const date = useMemo(() => layer === 'realtime-clouds' ? animatedDate : live ? new Date(nowTick) : new Date(selectedTime), [layer, animatedDate, live, nowTick, selectedTime])
  const day = date.toISOString().slice(0, 10)
  const subdailyTime = date.toISOString().slice(0, 16) + ':00Z'

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!playing || layer !== 'realtime-clouds') return
    const timer = window.setInterval(() => setFrameIndex(value => value >= 1008 ? 0 : value + 1), 1000 / speed)
    return () => window.clearInterval(timer)
  }, [playing, speed, layer])

  useEffect(() => {
    if (live && layer === 'realtime-clouds' && !playing) setFrameIndex(1008)
  }, [animationEnd, live, layer, playing])

  useEffect(() => {
    if (view !== 'globe' || !host.current) return
    let viewer: any
    let cancelled = false
    loadCesium().then(Cesium => {
      if (cancelled || !host.current) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(host.current, { animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, imageryProvider: false, requestRenderMode: true, maximumRenderTimeChange: Infinity })
      viewerRef.current = viewer
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#02060a')
      viewer.scene.globe.maximumScreenSpaceError = 1
      viewer.scene.globe.tileCacheSize = 800
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.globe.showGroundAtmosphere = true
      viewer.scene.fog.enabled = true
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 25
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80000000
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(15, 15, 21000000) })
      for (const marker of markers.slice(0, 500)) viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0), point: { pixelSize: 7, color: Cesium.Color.fromCssColorString('#ff674f'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND } })
      setReady(true)
    }).catch(reason => setError(String(reason)))
    return () => { cancelled = true; setReady(false); if (viewer && !viewer.isDestroyed()) viewer.destroy(); viewerRef.current = null; cesiumRef.current = null; host.current?.replaceChildren() }
  }, [view, markers])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium || view !== 'globe') return
    viewer.imageryLayers.removeAll()
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(date.toISOString())
    const detailedBase = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: HIGH_RESOLUTION_WORLD, minimumLevel: 0, maximumLevel: 19, credit: 'Esri World Imagery — szczegółowa warstwa bazowa' }))
    detailedBase.alpha = 1
    detailedBase.contrast = 1.03

    if (layer === 'realtime-clouds') {
      const cloudLayers = [
        ['GOES-East_ABI_GeoColor', 'GOES-East/ABI'],
        ['GOES-West_ABI_GeoColor', 'GOES-West/ABI'],
        ['Himawari_AHI_Band13_Clean_Infrared', 'Himawari-9/AHI'],
      ] as const
      for (const [layerName, credit] of cloudLayers) {
        const clouds = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_WMTS, layer: layerName, style: 'default', format: 'image/png', tileMatrixSetID: 'GoogleMapsCompatible_Level7', maximumLevel: 7, dimensions: { Time: subdailyTime }, credit: `NASA GIBS · ${credit}` }))
        clouds.alpha = cloudOpacity
      }
    }

    if (layer === 'nasa-day' || layer === 'nasa-night') {
      const nasaLayer = layer === 'nasa-night' ? 'VIIRS_SNPP_DayNightBand_ENCC' : 'VIIRS_SNPP_CorrectedReflectance_TrueColor'
      const nasa = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_WMTS, layer: nasaLayer, style: 'default', format: layer === 'nasa-night' ? 'image/png' : 'image/jpeg', tileMatrixSetID: 'GoogleMapsCompatible_Level9', maximumLevel: 9, dimensions: { Time: day }, credit: 'NASA EOSDIS GIBS' }))
      nasa.alpha = layer === 'nasa-night' ? .72 : .82
    }

    if (layer === 'copernicus-safe') {
      const copernicus = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({ url: CDSE_WMS, layers: import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR', rectangle: Cesium.Rectangle.fromDegrees(-180, -78, 180, 78), parameters: { transparent: true, format: 'image/png', time: `${day}/${day}`, maxcc: 20, showlogo: false }, credit: 'Copernicus Data Space' }))
      copernicus.alpha = .9
    }

    viewer.scene.globe.enableLighting = solarLighting
    viewer.scene.highDynamicRange = true
    viewer.scene.postProcessStages.fxaa.enabled = true
    viewer.scene.requestRender()
  }, [ready, layer, day, subdailyTime, view, date, solarLighting, cloudOpacity])

  const zoom = (factor: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.camera.zoomIn(Math.max(50, viewer.camera.positionCartographic.height * factor))
    viewer.scene.requestRender()
  }

  return <div className={`tiled-earth-shell ${nightVision ? 'night-vision' : ''}`}>
    <div className="tiled-earth-toolbar">
      <button type="button" className={view === 'globe' ? 'is-active' : ''} onClick={() => setView('globe')}>Ziemia z kosmosu</button>
      <button type="button" className={view === 'north' ? 'is-active' : ''} onClick={() => setView('north')}>Arktyka — zdjęcie</button>
      <button type="button" className={view === 'south' ? 'is-active' : ''} onClick={() => setView('south')}>Antarktyda — zdjęcie</button>
      {view === 'globe' && <>
        <label>Obraz<select value={layer} onChange={event => { setLayer(event.target.value as Layer); setPlaying(false) }}>
          <option value="realtime-clouds">Czas rzeczywisty — chmury co 10 minut</option><option value="high-resolution">Szczegółowa mapa satelitarna — duży zoom</option><option value="nasa-day">NASA VIIRS — prawdziwy kolor</option><option value="nasa-night">NASA VIIRS — nocne światła</option><option value="copernicus-safe">Copernicus — aktualna obserwacja</option>
        </select></label>
        <label><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} /> czas rzeczywisty</label>
        <label><input type="checkbox" checked={solarLighting} onChange={event => setSolarLighting(event.target.checked)} /> cień dnia i nocy</label>
        <label><input type="checkbox" checked={nightVision} onChange={event => setNightVision(event.target.checked)} /> noktowizor</label>
      </>}
      <div className="location-globe-status"><strong>{layer === 'realtime-clouds' ? 'CHMURY GEO · 10 MIN · HISTORIA 7 DNI' : 'PEŁNA ZIEMIA · SZCZEGÓŁOWE KAFELKI DO POZIOMU 19'}</strong><span>{date.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span><span>{layer === 'realtime-clouds' ? 'GOES-East + GOES-West + Himawari. Obraz jest bliski czasu rzeczywistego; najnowsze klatki mogą pojawiać się z opóźnieniem.' : 'Warstwa szczegółowa zachowuje ostrość przy przybliżaniu.'}</span>{error && <span>{error}</span>}</div>
    </div>
    {view === 'globe' ? <>
      {layer === 'realtime-clouds' && <div className="scene-controls">
        <button type="button" onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ Pauza' : '▶ Odtwarzaj 7 dni'}</button>
        <button type="button" onClick={() => { setPlaying(false); setFrameIndex(1008); setLive(true) }}>TERAZ</button>
        <label>Prędkość<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={1}>1 kl./s</option><option value={2}>2 kl./s</option><option value={4}>4 kl./s</option></select></label>
        <label>Chmury {Math.round(cloudOpacity * 100)}%<input type="range" min="20" max="100" value={Math.round(cloudOpacity * 100)} onChange={event => setCloudOpacity(Number(event.target.value) / 100)} /></label>
        <label>Klatka {frameIndex + 1}/1009<input type="range" min="0" max="1008" step="1" value={frameIndex} onChange={event => { setPlaying(false); setLive(false); setFrameIndex(Number(event.target.value)) }} /></label>
      </div>}
      <div className="tiled-earth-zoom"><button type="button" aria-label="Przybliż" onClick={() => zoom(.45)}>+</button><button type="button" aria-label="Oddal" onClick={() => zoom(-.85)}>−</button></div>
      <div ref={host} className="tiled-earth-canvas" />
    </> : <PolarScene mode={view} date={date} />}
  </div>
}
