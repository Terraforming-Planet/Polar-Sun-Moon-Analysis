import { useEffect, useMemo, useRef, useState } from 'react'
import './location-globe.css'
import './tiled-earth.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type UserLocation = { latitude: number; longitude: number; accuracy: number; timestamp: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }
type Layer = 'copernicus' | 'satellite' | 'nasa-auto' | 'nasa-day' | 'nasa-night'
type ViewMode = 'globe' | 'north-pole' | 'south-pole'
type Sensor = 'sentinel-2-l2a' | 'sentinel-1-grd' | 'sentinel-3-olci-l1b'

type StacAsset = { href?: string; type?: string; title?: string; roles?: string[] }
type StacItem = {
  id: string
  bbox?: number[]
  geometry?: { type?: string; coordinates?: unknown }
  properties?: Record<string, unknown>
  assets?: Record<string, StacAsset>
  links?: Array<{ rel?: string; href?: string; title?: string }>
}

type CesiumApi = {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => any
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => any
  WebMapTileServiceImageryProvider: new (options: Record<string, unknown>) => any
  WebMapServiceImageryProvider: new (options: Record<string, unknown>) => any
  Cartesian3: { fromDegrees: (longitude: number, latitude: number, height?: number) => any }
  Color: { fromCssColorString: (value: string) => any; WHITE: any; BLACK: any }
  VerticalOrigin: { BOTTOM: any }
  HeightReference: { CLAMP_TO_GROUND: any }
  JulianDate: { fromIso8601: (value: string) => any }
}

declare global {
  interface Window { Cesium?: CesiumApi; CESIUM_BASE_URL?: string }
}

const CESIUM_VERSION = '1.126'
const CESIUM_SCRIPT = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Cesium.js`
const CESIUM_CSS = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_BOUNDARIES = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const NASA_GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
const CDSE_INSTANCE_ID = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_LAYER = import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${CDSE_INSTANCE_ID}`
const STAC_SEARCH = 'https://stac.dataspace.copernicus.eu/v1/search'
const LIVE_WINDOW_MS = 2 * 60 * 1000
const LIVE_REFRESH_MS = 5_000

function loadCesium(): Promise<CesiumApi> {
  if (window.Cesium) return Promise.resolve(window.Cesium)
  window.CESIUM_BASE_URL = CESIUM_BASE
  if (!document.querySelector(`link[href="${CESIUM_CSS}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CESIUM_CSS
    document.head.appendChild(link)
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CESIUM_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium unavailable')))
      existing.addEventListener('error', () => reject(new Error('Nie udało się załadować CesiumJS.')))
      return
    }
    const script = document.createElement('script')
    script.src = CESIUM_SCRIPT
    script.async = true
    script.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium unavailable'))
    script.onerror = () => reject(new Error('Nie udało się załadować CesiumJS.'))
    document.head.appendChild(script)
  })
}

function clampToNow(value: string, now: Date) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return now
  return parsed.getTime() > now.getTime() ? now : parsed
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Dostęp do lokalizacji został odrzucony.'
  if (error.code === error.POSITION_UNAVAILABLE) return 'Pozycja jest obecnie niedostępna.'
  if (error.code === error.TIMEOUT) return 'Upłynął czas oczekiwania na pozycję GPS.'
  return 'Nie udało się odczytać lokalizacji.'
}

function dayRange(date: Date) {
  const day = date.toISOString().slice(0, 10)
  return `${day}T00:00:00.000Z/${day}T23:59:59.999Z`
}

function assetPriority(item: StacItem) {
  const assets = item.assets ?? {}
  const preferred = ['visual', 'rendered_preview', 'thumbnail', 'overview', 'preview', 'quicklook']
  for (const key of preferred) {
    const asset = assets[key]
    if (asset?.href && (asset.type?.startsWith('image/') || key !== 'visual')) return asset.href
  }
  const imageAsset = Object.values(assets).find(asset => asset.href && asset.type?.startsWith('image/'))
  return imageAsset?.href ?? ''
}

function productLink(item: StacItem) {
  return item.links?.find(link => link.rel === 'self')?.href
    ?? item.links?.find(link => link.rel === 'alternate')?.href
    ?? 'https://browser.dataspace.copernicus.eu/'
}

function propertyNumber(item: StacItem, keys: string[]) {
  for (const key of keys) {
    const value = item.properties?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function propertyText(item: StacItem, keys: string[]) {
  for (const key of keys) {
    const value = item.properties?.[key]
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value) && value.length) return value.join(', ')
  }
  return 'brak danych'
}

function sensorLabel(sensor: Sensor) {
  if (sensor === 'sentinel-2-l2a') return 'Sentinel-2 L2A True Color'
  if (sensor === 'sentinel-1-grd') return 'Sentinel-1 GRD radar'
  return 'Sentinel-3 OLCI'
}

function resolutionLabel(sensor: Sensor) {
  if (sensor === 'sentinel-2-l2a') return 'do 10 m/piksel dla pasm RGB produktu źródłowego'
  if (sensor === 'sentinel-1-grd') return 'zależna od trybu akwizycji produktu GRD'
  return 'około 300 m/piksel dla OLCI'
}

function PolarSceneViewer({ mode, date }: { mode: Exclude<ViewMode, 'globe'>; date: Date }) {
  const [sensor, setSensor] = useState<Sensor>('sentinel-1-grd')
  const [items, setItems] = useState<StacItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imageError, setImageError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [showFootprint, setShowFootprint] = useState(true)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const selected = items.find(item => item.id === selectedId) ?? items[0]
  const imageUrl = selected ? assetPriority(selected) : ''
  const projection = mode === 'north-pole' ? 'EPSG:3413' : 'EPSG:3031'
  const poleName = mode === 'north-pole' ? 'Arktyka' : 'Antarktyda'

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setItems([])
    setSelectedId('')
    setImageError(false)

    const bbox = mode === 'north-pole' ? [-180, 78, 180, 90] : [-180, -90, 180, -78]
    const body: Record<string, unknown> = {
      collections: [sensor],
      bbox,
      datetime: dayRange(date),
      limit: 40,
      sortby: [{ field: 'datetime', direction: 'desc' }],
    }
    if (sensor === 'sentinel-2-l2a') body.filter = 'eo:cloud_cover <= 80'

    fetch(STAC_SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error(`STAC HTTP ${response.status}`)
        return response.json()
      })
      .then(data => {
        const features = Array.isArray(data?.features) ? data.features as StacItem[] : []
        const sorted = features.sort((a, b) => Number(Boolean(assetPriority(b))) - Number(Boolean(assetPriority(a))))
        setItems(sorted)
        if (sorted[0]) setSelectedId(sorted[0].id)
        if (!sorted.length) setError('Brak pojedynczej oryginalnej sceny dla wybranej daty i obszaru. Wybierz inną datę, satelitę lub sprawdź katalog produktu.')
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(`Nie udało się przeszukać katalogu Copernicus: ${String(reason instanceof Error ? reason.message : reason)}`)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [mode, sensor, date.getTime()])

  useEffect(() => {
    setImageError(false)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [selectedId])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setOffset({ x: drag.ox + event.clientX - drag.x, y: drag.oy + event.clientY - drag.y })
  }

  const stopDrag = () => { dragRef.current = null }
  const cloud = selected ? propertyNumber(selected, ['eo:cloud_cover', 'cloudCover']) : null
  const acquired = selected ? propertyText(selected, ['datetime', 'start_datetime']) : 'brak danych'
  const platform = selected ? propertyText(selected, ['platform', 'constellation']) : 'brak danych'
  const instrument = selected ? propertyText(selected, ['instruments', 'instrument']) : 'brak danych'

  return (
    <div className="original-scene-module">
      <div className="scene-controls">
        <label>Źródło
          <select value={sensor} onChange={event => setSensor(event.target.value as Sensor)}>
            <option value="sentinel-1-grd">Sentinel-1 GRD — radar, najlepszy przy biegunach i nocą</option>
            <option value="sentinel-2-l2a">Sentinel-2 L2A — oryginalna scena optyczna</option>
            <option value="sentinel-3-olci-l1b">Sentinel-3 OLCI — szerszy pas, niższa rozdzielczość</option>
          </select>
        </label>
        <label>Produkt
          <select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)} disabled={!items.length}>
            {!items.length && <option value="">Brak produktów</option>}
            {items.map(item => <option key={item.id} value={item.id}>{propertyText(item, ['datetime', 'start_datetime'])} — {item.id}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setZoom(value => Math.min(8, value * 1.4))}>+</button>
        <button type="button" onClick={() => setZoom(value => Math.max(0.5, value / 1.4))}>−</button>
        <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>Reset</button>
        <button type="button" className={showFootprint ? 'is-active' : ''} onClick={() => setShowFootprint(value => !value)}>Footprint</button>
      </div>

      <div className="scene-status">
        <strong>{poleName} — pojedynczy produkt, bez mozaiki</strong>
        <span>Układ analizy: {projection}. Obraz nie jest rozciągany do punktu 90° i nie jest sklejany z sąsiednimi scenami.</span>
        <span>{sensorLabel(sensor)} · {resolutionLabel(sensor)}</span>
      </div>

      <div className="scene-layout">
        <div className="scene-canvas" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          {loading && <div className="scene-message">Wyszukiwanie oryginalnych produktów w katalogu CDSE…</div>}
          {!loading && error && <div className="scene-message scene-error">{error}</div>}
          {!loading && selected && imageUrl && !imageError && (
            <div className="scene-image-frame" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
              <img src={imageUrl} alt={`Oryginalny podgląd produktu ${selected.id}`} draggable={false} onError={() => setImageError(true)} />
              {showFootprint && <div className="scene-footprint" aria-label="Granica pojedynczego produktu">Pojedynczy footprint produktu</div>}
            </div>
          )}
          {!loading && selected && (!imageUrl || imageError) && (
            <div className="scene-message scene-error">
              <strong>Produkt istnieje, ale katalog nie udostępnił publicznego podglądu obrazu.</strong>
              <span>Nie generujemy zastępczej mozaiki. Otwórz produkt w Copernicus, aby pobrać oryginalne dane źródłowe.</span>
            </div>
          )}
          <div className="pole-marker" title="Dokładny biegun geograficzny — może znajdować się poza footprintem wybranego produktu"><span /><span /></div>
          <div className="scene-scale">Skala podglądu zależy od produktu; zoom interfejsu: {zoom.toFixed(2)}×</div>
        </div>

        <aside className="scene-metadata">
          <h3>Metadane oryginalnego produktu</h3>
          {selected ? <>
            <dl>
              <dt>ID produktu</dt><dd>{selected.id}</dd>
              <dt>Data i czas rejestracji</dt><dd>{acquired}</dd>
              <dt>Platforma</dt><dd>{platform}</dd>
              <dt>Instrument</dt><dd>{instrument}</dd>
              <dt>Kolekcja</dt><dd>{sensor}</dd>
              <dt>Rozdzielczość</dt><dd>{resolutionLabel(sensor)}</dd>
              <dt>Zachmurzenie</dt><dd>{cloud === null ? 'nie dotyczy / brak danych' : `${cloud.toFixed(1)}%`}</dd>
              <dt>Układ analizy</dt><dd>{projection}</dd>
              <dt>BBOX produktu</dt><dd>{selected.bbox?.join(', ') ?? 'brak danych'}</dd>
            </dl>
            <a className="scene-product-link" href={productLink(selected)} target="_blank" rel="noreferrer">Otwórz rekord produktu / pobierz dane</a>
          </> : <p>Wybierz datę lub inne źródło, aby znaleźć produkt.</p>}
          <p className="scene-science-note">Pojedyncze zdjęcie całego bieguna może nie istnieć. Satelita wykonuje sceny lub pasy podczas przelotu. Brak obrazu w dokładnym punkcie 90° jest wynikiem pokrycia orbitalnego, a nie błędem do sztucznego uzupełnienia.</p>
        </aside>
      </div>
    </div>
  )
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const userEntityRef = useRef<any>(null)
  const [viewerReady, setViewerReady] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('globe')
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [layer, setLayer] = useState<Layer>('copernicus')
  const [liveNow, setLiveNow] = useState(() => new Date())

  const selectedDate = useMemo(() => clampToNow(selectedTime, liveNow), [selectedTime, liveNow])
  const selectedMs = new Date(selectedTime).getTime()
  const liveMode = Number.isFinite(selectedMs) && Math.abs(selectedMs - liveNow.getTime()) <= LIVE_WINDOW_MS
  const effectiveDate = liveMode ? liveNow : selectedDate
  const date = effectiveDate.toISOString().slice(0, 10)
  const futureWasClamped = Number.isFinite(selectedMs) && selectedMs > liveNow.getTime()

  useEffect(() => {
    if (!liveMode) return
    const timer = window.setInterval(() => setLiveNow(new Date()), LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [liveMode])

  const stopTracking = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setLocating(false)
  }

  const startTracking = () => {
    if (!('geolocation' in navigator)) {
      setLocationError('Ta przeglądarka nie obsługuje geolokalizacji.')
      return
    }
    stopTracking()
    setLocationError(null)
    setLocating(true)
    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp })
        setLocationError(null)
      },
      error => { setLocationError(geolocationErrorMessage(error)); setLocating(false) },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )
  }

  const flyTo = (longitude: number, latitude: number, height: number) => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height), duration: 1.4 })
  }

  const zoomGlobe = (factor: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    const height = viewer.camera.positionCartographic.height
    viewer.camera.zoomIn(Math.max(500, height * factor))
  }

  useEffect(() => () => stopTracking(), [])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium || !userLocation) return
    const position = Cesium.Cartesian3.fromDegrees(userLocation.longitude, userLocation.latitude, 0)
    if (!userEntityRef.current) {
      userEntityRef.current = viewer.entities.add({
        position,
        point: { pixelSize: 14, color: Cesium.Color.fromCssColorString('#74ffb8'), outlineColor: Cesium.Color.BLACK, outlineWidth: 3, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
        label: { text: 'Twoja pozycja', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 4, style: 2, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: { x: 0, y: -18 } },
      })
    } else userEntityRef.current.position = position
  }, [userLocation, viewerReady])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewerReady || !viewer || !Cesium || viewMode !== 'globe') return

    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(effectiveDate.toISOString())
    viewer.scene.globe.enableLighting = layer === 'nasa-night' || layer === 'nasa-auto'
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#18222d')
    viewer.imageryLayers.removeAll()

    const referenceBase = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: ESRI_WORLD_IMAGERY, maximumLevel: 19, credit: 'Esri World Imagery — warstwa bazowa i awaryjna' }))
    referenceBase.alpha = 1
    referenceBase.brightness = layer === 'nasa-night' ? 0.48 : 1
    referenceBase.contrast = 1.05
    referenceBase.saturation = layer === 'nasa-night' ? 0.55 : 1

    if (layer === 'copernicus') {
      const sentinel = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({
        url: CDSE_WMS, layers: CDSE_LAYER,
        parameters: { transparent: true, format: 'image/png', time: `${date}/${date}`, maxcc: 20, showlogo: false },
        getFeatureInfoParameters: { time: `${date}/${date}`, maxcc: 20 },
        credit: 'Copernicus Data Space Ecosystem — Sentinel-2 L2A Natural Color',
      }))
      sentinel.alpha = 1
    } else if (layer !== 'satellite') {
      const addNasaLayer = (name: string, format: string, alpha: number, credit: string) => {
        const imagery = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_GIBS_WMTS, layer: name, style: 'default', format, tileMatrixSetID: 'GoogleMapsCompatible_Level9', maximumLevel: 9, dimensions: { Time: date }, credit }))
        imagery.alpha = alpha
      }
      if (layer === 'nasa-day') addNasaLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'image/jpeg', 0.92, 'NASA EOSDIS GIBS — VIIRS True Color')
      else if (layer === 'nasa-night') addNasaLayer('VIIRS_SNPP_DayNightBand_ENCC', 'image/png', 0.72, 'NASA EOSDIS GIBS — VIIRS Day/Night Band')
      else {
        addNasaLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'image/jpeg', 0.58, 'NASA EOSDIS GIBS — VIIRS True Color')
        addNasaLayer('VIIRS_SNPP_DayNightBand_ENCC', 'image/png', 0.34, 'NASA EOSDIS GIBS — VIIRS Day/Night Band')
      }
    }

    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: ESRI_BOUNDARIES, maximumLevel: 12, credit: 'Esri boundaries and places' }))
    viewer.scene.requestRender()
  }, [viewerReady, layer, date, effectiveDate, viewMode])

  useEffect(() => {
    if (viewMode !== 'globe') return
    const element = host.current
    if (!element) return
    let cancelled = false
    let viewer: any

    loadCesium().then(Cesium => {
      if (cancelled) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(element, { animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, terrainProvider: undefined, imageryProvider: false })
      viewerRef.current = viewer
      viewer.scene.globe.enableLighting = false
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#18222d')
      viewer.scene.globe.depthTestAgainstTerrain = false
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80000000
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(effectiveDate.toISOString())

      for (const marker of markers.slice(0, 1000)) {
        viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0), point: { pixelSize: Math.max(6, 8 * (marker.radius ?? 1)), color: Cesium.Color.fromCssColorString('#ff674f'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND } })
      }
      setViewerReady(true)
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(15, 20, 20000000) })
    }).catch(error => { if (!cancelled) setLoadError(String(error instanceof Error ? error.message : error)) })

    return () => {
      cancelled = true
      setViewerReady(false)
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
      cesiumRef.current = null
      userEntityRef.current = null
      element.replaceChildren()
    }
  }, [markers, viewMode])

  const layerLabel = layer === 'copernicus' ? `Copernicus Sentinel-2 Natural Color — ${date}` : layer === 'satellite' ? 'szczegółowa mozaika referencyjna' : layer === 'nasa-day' ? 'NASA VIIRS True Color' : layer === 'nasa-night' ? 'NASA VIIRS DNB' : 'NASA dzień i noc'

  return (
    <div className={`tiled-earth-shell ${viewMode !== 'globe' ? 'is-polar-scene' : ''}`}>
      <div className="tiled-earth-toolbar">
        <button type="button" className={viewMode === 'globe' ? 'is-active' : ''} onClick={() => setViewMode('globe')}>Globus 3D</button>
        <button type="button" className={viewMode === 'north-pole' ? 'is-active' : ''} onClick={() => setViewMode('north-pole')}>Arktyka — pojedyncza scena</button>
        <button type="button" className={viewMode === 'south-pole' ? 'is-active' : ''} onClick={() => setViewMode('south-pole')}>Antarktyda — pojedyncza scena</button>

        {viewMode === 'globe' && <>
          <button type="button" onClick={locating ? stopTracking : startTracking}>{locating ? 'Zatrzymaj lokalizację' : 'Znajdź mnie'}</button>
          <button type="button" onClick={() => userLocation && flyTo(userLocation.longitude, userLocation.latitude, 25000)} disabled={!userLocation}>Przybliż do mojej pozycji</button>
          <button type="button" onClick={() => flyTo(20, 52, 5500000)}>Europa</button>
          <label>Warstwa<select value={layer} onChange={event => setLayer(event.target.value as Layer)}><option value="copernicus">Copernicus Sentinel-2 — wysoka jakość</option><option value="nasa-auto">NASA — automatycznie dzień/noc</option><option value="nasa-day">NASA — zdjęcie dzienne</option><option value="nasa-night">NASA — zdjęcie nocne VIIRS DNB</option><option value="satellite">Satelita szczegółowa — mozaika referencyjna</option></select></label>
        </>}

        <div className="location-globe-status" role="status" aria-live="polite">
          <strong>{viewMode === 'globe' ? (liveMode ? 'TRYB TERAZ — kontrola co 5 sekund' : 'TRYB HISTORYCZNY') : 'TRYB NAUKOWY — JEDEN PRODUKT'}</strong>
          <span>Wyświetlany czas: {effectiveDate.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span>
          <span>{viewMode === 'globe' ? `Warstwa: ${layerLabel}` : 'Bez WMS-mozaiki, bez promienistych linii łączenia i bez sztucznego wypełniania środka bieguna.'}</span>
          {!viewerReady && viewMode === 'globe' && <span>Ładowanie globu i kafelków…</span>}
          {futureWasClamped && <span className="location-globe-error">Data przyszła została cofnięta do aktualnego czasu.</span>}
          {locationError && <span className="location-globe-error">{locationError}</span>}
          {loadError && <span className="location-globe-error">{loadError}</span>}
        </div>
      </div>

      {viewMode === 'globe' ? <>
        <div className="tiled-earth-zoom" aria-label="Sterowanie przybliżeniem"><button type="button" aria-label="Przybliż" onClick={() => zoomGlobe(0.45)}>+</button><button type="button" aria-label="Oddal" onClick={() => zoomGlobe(-0.85)}>−</button></div>
        <div className="tiled-earth-attribution">Globus służy do nawigacji globalnej. Obserwacje biegunów korzystają z osobnej listy pojedynczych produktów CDSE.</div>
        <div ref={host} className="tiled-earth-canvas" aria-label="Kafelkowy glob 3D z obrazami Copernicus Sentinel-2 i warstwami NASA" />
      </> : <PolarSceneViewer mode={viewMode} date={effectiveDate} />}
    </div>
  )
}
