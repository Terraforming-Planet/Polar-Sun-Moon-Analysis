import { useEffect, useMemo, useRef, useState } from 'react'
import './location-globe.css'
import './tiled-earth.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[] }
type ViewMode = 'globe' | 'north' | 'south'
type Layer = 'full-live-earth' | 'global-clouds' | 'regional-clouds' | 'ocean-waves' | 'high-resolution' | 'nasa-day' | 'nasa-night' | 'copernicus-safe'
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
const NASA_GLOBAL_TRUE_COLOR = 'VIIRS_SNPP_CorrectedReflectance_TrueColor'
const WAVEWATCH_WMS = 'https://erddap.aoml.noaa.gov/hdb/erddap/wms/WaveWatch_2026/request'
const STAC_SEARCH = 'https://stac.dataspace.copernicus.eu/v1/search'
const CDSE_INSTANCE = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${CDSE_INSTANCE}`
const TEN_MINUTES = 10 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
const LAST_FRAME = 1008

const REGIONAL_CLOUD_PRODUCTS = [
  ['GOES-East_ABI_GeoColor', 'GOES-East'],
  ['GOES-West_ABI_GeoColor', 'GOES-West'],
  ['Himawari_AHI_Band13_Clean_Infrared', 'Himawari'],
] as const

function floorToTenMinutes(value: Date) { return new Date(Math.floor(value.getTime() / TEN_MINUTES) * TEN_MINUTES) }

function markerCssColor(marker: Marker) {
  const value = Math.max(0, Math.min(0xffffff, marker.color ?? 0xff674f))
  return `#${value.toString(16).padStart(6, '0')}`
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
  for (const key of ['visual', 'rendered_preview', 'thumbnail', 'overview', 'preview', 'quicklook']) if (item.assets?.[key]?.href) return item.assets[key]?.href ?? ''
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collections: [sensor], bbox: mode === 'north' ? [-180, 72, 180, 90] : [-180, -90, 180, -72], datetime: `${day}T00:00:00Z/${day}T23:59:59Z`, limit: 50 }),
      signal: controller.signal,
    }).then(response => response.ok ? response.json() : Promise.reject(new Error(`STAC ${response.status}`)))
      .then(data => {
        const found = Array.isArray(data.features) ? data.features as StacItem[] : []
        setItems(found)
        setSelectedId(found[0]?.id ?? '')
        if (!found.length) setError('Brak pojedynczej sceny dla tego dnia. Zmień datę lub sensor.')
      }).catch(reason => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(String(reason))
      })
    return () => controller.abort()
  }, [mode, sensor, day])

  return <div className="original-scene-module">
    <div className="scene-controls">
      <label>Sensor<select value={sensor} onChange={event => setSensor(event.target.value as Sensor)}><option value="sentinel-2-l2a">Sentinel-2 — prawdziwy kolor</option><option value="sentinel-1-grd">Sentinel-1 — radar</option><option value="sentinel-3-olci-l1b">Sentinel-3 — szeroki obraz</option></select></label>
      <label>Oryginalny produkt<select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>{items.map(item => <option key={item.id}>{item.id}</option>)}</select></label>
      <button type="button" onClick={() => setZoom(value => Math.min(32, value * 1.45))}>+</button>
      <button type="button" onClick={() => setZoom(value => Math.max(.25, value / 1.45))}>−</button>
      <button type="button" onClick={() => setZoom(1)}>Reset</button>
    </div>
    <div className="scene-status"><strong>{mode === 'north' ? 'Arktyka' : 'Antarktyda'} — autentyczna scena satelitarna</strong><span>Bez generowania brakujących pikseli.</span></div>
    <div className="scene-layout"><div className="scene-canvas">{error && <div className="scene-message scene-error">{error}</div>}{selected && image && <div className="scene-image-frame" style={{ transform: `scale(${zoom})` }}><img src={image} alt={selected.id} /></div>}</div></div>
  </div>
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const constrainedDevice = useMemo(() => {
    if (typeof window === 'undefined') return false
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
    return coarsePointer || window.innerWidth <= 768
  }, [])
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewMode>('globe')
  const [layer, setLayer] = useState<Layer>('full-live-earth')
  const [nightVision, setNightVision] = useState(false)
  const [live, setLive] = useState(true)
  const [solarLighting, setSolarLighting] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [frameIndex, setFrameIndex] = useState(LAST_FRAME)
  const [cloudOpacity, setCloudOpacity] = useState(.72)
  const [waveOpacity, setWaveOpacity] = useState(.52)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [error, setError] = useState('')
  const animationEnd = useMemo(() => floorToTenMinutes(new Date(nowTick)), [nowTick])
  const animationStart = useMemo(() => new Date(animationEnd.getTime() - SEVEN_DAYS), [animationEnd])
  const animatedDate = useMemo(() => new Date(animationStart.getTime() + frameIndex * TEN_MINUTES), [animationStart, frameIndex])
  const animatedMode = layer === 'regional-clouds' || layer === 'ocean-waves'
  const cloudCoverageMode = layer === 'full-live-earth' || layer === 'global-clouds' || layer === 'regional-clouds'
  const date = useMemo(() => animatedMode ? animatedDate : live ? new Date(nowTick) : new Date(selectedTime), [animatedMode, animatedDate, live, nowTick, selectedTime])
  const day = date.toISOString().slice(0, 10)
  const subdailyTime = date.toISOString().slice(0, 16) + ':00Z'
  const fullLiveTitle = constrainedDevice
    ? 'PEŁNA ZIEMIA · GLOBALNY TRUE COLOR + CHMURY'
    : 'PEŁNA ZIEMIA · GLOBALNY TRUE COLOR + CHMURY + FALE'
  const coverageNote = layer === 'regional-clouds'
    ? 'Tryb regionalny: klatki geostacjonarne około 10 min są nakładane delikatnie na globalny VIIRS. Granice regionalnych sensorów są cechą źródła.'
    : layer === 'full-live-earth' || layer === 'global-clouds'
      ? 'Chmury są renderowane bez cienia terminatora, aby pozostawały widoczne na całym globie. Warstwa NASA VIIRS ma jeden układ kafelków i nie jest zszywana z prostokątów GOES/Himawari.'
      : constrainedDevice
        ? 'Tryb mobilny: adaptacyjna jakość kafelków, mniejszy cache i bezpieczny zoom do ok. 25 m nad powierzchnią.'
        : 'Tryb pełny: szczegółowość zależy od rozdzielczości źródłowych kafelków dla danego miejsca.'

  useEffect(() => { const timer = window.setInterval(() => setNowTick(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (!playing || !animatedMode) return; const timer = window.setInterval(() => setFrameIndex(value => value >= LAST_FRAME ? 0 : value + 1), 1000 / speed); return () => window.clearInterval(timer) }, [playing, speed, animatedMode])
  useEffect(() => { if (live && animatedMode && !playing) setFrameIndex(LAST_FRAME) }, [animationEnd, live, animatedMode, playing])

  useEffect(() => {
    if (view !== 'globe' || !host.current) return
    let viewer: any
    let cancelled = false
    loadCesium().then(Cesium => {
      if (cancelled || !host.current) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(host.current, { animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, imageryProvider: false, requestRenderMode: true, maximumRenderTimeChange: Infinity })
      viewerRef.current = viewer
      viewer.resolutionScale = constrainedDevice ? .72 : 1
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#02060a')
      viewer.scene.globe.maximumScreenSpaceError = constrainedDevice ? 1.5 : .5
      viewer.scene.globe.tileCacheSize = constrainedDevice ? 250 : 900
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.globe.showGroundAtmosphere = true
      viewer.scene.fog.enabled = true
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = constrainedDevice ? 25 : 5
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80000000
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = true
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(15, 15, 21000000) })
      setReady(true)
    }).catch(reason => setError(String(reason)))
    return () => { cancelled = true; setReady(false); if (viewer && !viewer.isDestroyed()) viewer.destroy(); viewerRef.current = null; cesiumRef.current = null; host.current?.replaceChildren() }
  }, [view, constrainedDevice])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium || view !== 'globe') return
    viewer.entities.removeAll()
    const markerLimit = constrainedDevice ? 250 : 500
    for (const marker of markers.slice(0, markerLimit)) {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0),
        point: {
          pixelSize: Math.max(5, Math.min(12, 6 + (marker.radius ?? 1))),
          color: Cesium.Color.fromCssColorString(markerCssColor(marker)),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      })
    }
    viewer.scene.requestRender()
  }, [ready, view, markers, constrainedDevice])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium || view !== 'globe') return
    viewer.imageryLayers.removeAll()
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(date.toISOString())

    const base = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: HIGH_RESOLUTION_WORLD, minimumLevel: 0, maximumLevel: 23, credit: 'Esri World Imagery' }))
    base.alpha = 1
    base.contrast = 1.04

    const usesGlobalTrueColor = layer === 'full-live-earth' || layer === 'global-clouds' || layer === 'regional-clouds' || layer === 'nasa-day'
    if (usesGlobalTrueColor) {
      const trueColor = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_WMTS, layer: NASA_GLOBAL_TRUE_COLOR, style: 'default', format: 'image/jpeg', tileMatrixSetID: 'GoogleMapsCompatible_Level9', maximumLevel: 9, dimensions: { Time: day }, credit: 'NASA GIBS · Suomi NPP VIIRS True Color' }))
      trueColor.alpha = layer === 'regional-clouds' ? .9 : 1
    }

    if (layer === 'regional-clouds') {
      const cloudProducts = constrainedDevice ? REGIONAL_CLOUD_PRODUCTS.slice(0, 1) : REGIONAL_CLOUD_PRODUCTS
      const regionalAlpha = constrainedDevice ? Math.min(.30, cloudOpacity * .42) : Math.min(.40, cloudOpacity * .55)
      for (const [name, credit] of cloudProducts) {
        const clouds = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_WMTS, layer: name, style: 'default', format: 'image/png', tileMatrixSetID: 'GoogleMapsCompatible_Level7', maximumLevel: 7, dimensions: { Time: subdailyTime }, credit: `NASA GIBS · ${credit} · regional subdaily` }))
        clouds.alpha = regionalAlpha
      }
    }

    if (layer === 'ocean-waves' || (!constrainedDevice && layer === 'full-live-earth')) {
      const waves = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({ url: WAVEWATCH_WMS, layers: 'WaveWatch_2026:Thgt', parameters: { transparent: true, format: 'image/png', time: date.toISOString(), colorscalerange: '0,12' }, credit: 'NOAA/PacIOOS WaveWatch III · significant wave height' }))
      waves.alpha = waveOpacity
    }
    if (layer === 'nasa-night') {
      const night = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_WMTS, layer: 'VIIRS_SNPP_DayNightBand_ENCC', style: 'default', format: 'image/png', tileMatrixSetID: 'GoogleMapsCompatible_Level9', maximumLevel: 9, dimensions: { Time: day }, credit: 'NASA VIIRS night lights' }))
      night.alpha = .78
    }
    if (layer === 'copernicus-safe') {
      const copernicus = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({ url: CDSE_WMS, layers: import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR', rectangle: Cesium.Rectangle.fromDegrees(-180, -78, 180, 78), parameters: { transparent: true, format: 'image/png', time: `${day}/${day}`, maxcc: 100, showlogo: false }, credit: 'Copernicus Data Space' }))
      copernicus.alpha = .9
    }

    viewer.scene.globe.enableLighting = solarLighting && !cloudCoverageMode
    viewer.scene.highDynamicRange = !constrainedDevice
    viewer.scene.postProcessStages.fxaa.enabled = !constrainedDevice
    viewer.scene.requestRender()
  }, [ready, layer, day, subdailyTime, view, date, solarLighting, cloudOpacity, waveOpacity, constrainedDevice, cloudCoverageMode])

  const zoom = (factor: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    const height = viewer.camera.positionCartographic.height
    const amount = factor > 0 ? Math.max(.25, height * factor) : Math.min(-.25, height * factor)
    viewer.camera.zoomIn(amount)
    viewer.scene.requestRender()
  }

  const maximumZoom = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    const minimumHeight = constrainedDevice ? 25 : 5
    const height = viewer.camera.positionCartographic.height
    if (height > minimumHeight) viewer.camera.zoomIn(height - minimumHeight)
    viewer.scene.requestRender()
  }

  const globalView = () => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(15, 15, 21000000), duration: 1.2 })
  }

  return <div className={`tiled-earth-shell ${nightVision ? 'night-vision' : ''}`}>
    <div className="tiled-earth-toolbar">
      <button type="button" className={view === 'globe' ? 'is-active' : ''} onClick={() => setView('globe')}>Ziemia 3D — pełny obraz</button>
      <button type="button" className={view === 'north' ? 'is-active' : ''} onClick={() => setView('north')}>Arktyka — zdjęcie</button>
      <button type="button" className={view === 'south' ? 'is-active' : ''} onClick={() => setView('south')}>Antarktyda — zdjęcie</button>
      {view === 'globe' && <>
        <label>Obraz<select value={layer} onChange={event => { setLayer(event.target.value as Layer); setPlaying(false) }}><option value="full-live-earth">PEŁNA PLANETA — globalny obraz dzienny + chmury + fale</option><option value="global-clouds">Chmury globalne — NASA VIIRS, mozaika dzienna</option><option value="regional-clouds">Chmury regionalne — GOES/Himawari, około 10 min</option><option value="ocean-waves">Fale oceaniczne — wysokość znacząca</option><option value="high-resolution">Szczegółowa mapa satelitarna — maksymalny zoom</option><option value="nasa-day">NASA VIIRS — prawdziwy kolor</option><option value="nasa-night">NASA VIIRS — nocne światła</option><option value="copernicus-safe">Copernicus — aktualna obserwacja</option></select></label>
        <label><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} /> czas rzeczywisty</label>
        <label title={cloudCoverageMode ? 'Wyłączone w trybach chmurowych, aby terminator nie odcinał widoczności chmur.' : undefined}><input type="checkbox" checked={solarLighting} disabled={cloudCoverageMode} onChange={event => setSolarLighting(event.target.checked)} /> dzień/noc{cloudCoverageMode ? ' — bez odcięcia chmur' : ''}</label>
        <label><input type="checkbox" checked={nightVision} onChange={event => setNightVision(event.target.checked)} /> noktowizor</label>
      </>}
      <div className="location-globe-status"><strong>{layer === 'full-live-earth' ? fullLiveTitle : layer === 'global-clouds' ? 'GLOBALNE CHMURY · NASA VIIRS · PEŁNA WIDOCZNOŚĆ GLOBU' : animatedMode ? 'ANIMACJA ŹRÓDŁA · KROK 10 MINUT' : 'PEŁNA ZIEMIA · MAKSYMALNY ZOOM'}</strong><span>{date.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span><span>{coverageNote}</span>{error && <span>{error}</span>}</div>
    </div>
    {view === 'globe' ? <>
      {animatedMode && <div className="scene-controls tiled-earth-playback"><button type="button" onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ Pauza' : '▶ Odtwarzaj 7 dni'}</button><button type="button" onClick={() => { setPlaying(false); setFrameIndex(LAST_FRAME); setLive(true) }}>TERAZ</button><label>Prędkość<select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={1}>1 kl./s</option><option value={2}>2 kl./s</option><option value={4}>4 kl./s</option></select></label>{layer === 'regional-clouds' && <label>Regionalne chmury {Math.round(cloudOpacity * 100)}%<input type="range" min="10" max="80" value={Math.round(cloudOpacity * 100)} onChange={event => setCloudOpacity(Number(event.target.value) / 100)} /></label>}{layer === 'ocean-waves' && <label>Fale {Math.round(waveOpacity * 100)}%<input type="range" min="10" max="90" value={Math.round(waveOpacity * 100)} onChange={event => setWaveOpacity(Number(event.target.value) / 100)} /></label>}<label>Klatka {frameIndex + 1}/1009<input type="range" min="0" max={LAST_FRAME} step="1" value={frameIndex} onChange={event => { setPlaying(false); setLive(false); setFrameIndex(Number(event.target.value)) }} /></label></div>}
      <div className="tiled-earth-zoom"><button type="button" aria-label="Przybliż" onClick={() => zoom(.55)}>+</button><button type="button" aria-label="Maksymalne przybliżenie" onClick={maximumZoom}>MAX</button><button type="button" aria-label="Widok całej planety" onClick={globalView}>🌍</button><button type="button" aria-label="Oddal" onClick={() => zoom(-.7)}>−</button></div>
      <div ref={host} className="tiled-earth-canvas" />
    </> : <PolarScene mode={view} date={date} />}
  </div>
}
