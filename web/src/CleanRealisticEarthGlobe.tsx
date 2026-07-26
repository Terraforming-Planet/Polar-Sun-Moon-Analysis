import { useEffect, useMemo, useRef, useState } from 'react'
import './location-globe.css'
import './tiled-earth.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[] }
type Layer = 'reference' | 'copernicus-safe' | 'nasa-day' | 'nasa-night'
type ViewMode = 'globe' | 'north' | 'south'
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
const CESIUM_SCRIPT = `${CESIUM_BASE}Cesium.js`
const CESIUM_CSS = `${CESIUM_BASE}Widgets/widgets.css`
const ESRI_WORLD = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_LABELS = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const NASA_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
const INSTANCE_ID = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_LAYER = import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${INSTANCE_ID}`
const STAC_SEARCH = 'https://stac.dataspace.copernicus.eu/v1/search'

function clampDate(value: string) {
  const now = new Date()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed > now) return now
  return parsed
}

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
    const script = document.createElement('script')
    script.src = CESIUM_SCRIPT
    script.async = true
    script.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Cesium unavailable'))
    script.onerror = () => reject(new Error('Nie udało się załadować CesiumJS.'))
    document.head.appendChild(script)
  })
}

function assetUrl(item?: StacItem) {
  if (!item) return ''
  const assets = item.assets ?? {}
  for (const key of ['visual', 'rendered_preview', 'thumbnail', 'overview', 'preview', 'quicklook']) {
    if (assets[key]?.href) return assets[key].href ?? ''
  }
  return Object.values(assets).find(asset => asset.href && asset.type?.startsWith('image/'))?.href ?? ''
}

function itemText(item: StacItem | undefined, key: string) {
  const value = item?.properties?.[key]
  return typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : 'brak danych'
}

function PolarScene({ mode, date }: { mode: 'north' | 'south'; date: Date }) {
  const [sensor, setSensor] = useState<Sensor>('sentinel-1-grd')
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
    setItems([])
    const body = {
      collections: [sensor],
      bbox: mode === 'north' ? [-180, 78, 180, 90] : [-180, -90, 180, -78],
      datetime: `${day}T00:00:00Z/${day}T23:59:59Z`,
      limit: 40,
    }
    fetch(STAC_SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`STAC HTTP ${response.status}`)))
      .then(data => {
        const found = Array.isArray(data?.features) ? data.features as StacItem[] : []
        setItems(found)
        setSelectedId(found[0]?.id ?? '')
        if (!found.length) setError('Brak pojedynczej oryginalnej sceny dla wybranego dnia i obszaru.')
      })
      .catch(reason => { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(String(reason)) })
    return () => controller.abort()
  }, [mode, sensor, day])

  return <div className="original-scene-module">
    <div className="scene-controls">
      <label>Źródło<select value={sensor} onChange={event => setSensor(event.target.value as Sensor)}>
        <option value="sentinel-1-grd">Sentinel-1 GRD — radar</option>
        <option value="sentinel-2-l2a">Sentinel-2 L2A — scena optyczna</option>
        <option value="sentinel-3-olci-l1b">Sentinel-3 OLCI</option>
      </select></label>
      <label>Produkt<select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>{items.map(item => <option key={item.id}>{item.id}</option>)}</select></label>
      <button type="button" onClick={() => setZoom(value => Math.min(8, value * 1.4))}>+</button>
      <button type="button" onClick={() => setZoom(value => Math.max(.5, value / 1.4))}>−</button>
      <button type="button" onClick={() => setZoom(1)}>Reset</button>
    </div>
    <div className="scene-status"><strong>{mode === 'north' ? 'Arktyka' : 'Antarktyda'} — pojedyncza scena</strong><span>Bez mozaiki WMS i bez rozciągania do punktu 90°.</span></div>
    <div className="scene-layout">
      <div className="scene-canvas">
        {error && <div className="scene-message scene-error">{error}</div>}
        {!error && selected && image && <div className="scene-image-frame" style={{ transform: `scale(${zoom})` }}><img src={image} alt={`Produkt ${selected.id}`} draggable={false} /><div className="scene-footprint">Pojedynczy footprint produktu</div></div>}
        {!error && selected && !image && <div className="scene-message scene-error">Produkt istnieje, ale nie ma publicznego podglądu. Otwórz rekord i pobierz oryginalny produkt.</div>}
      </div>
      <aside className="scene-metadata"><h3>Metadane produktu</h3><dl><dt>ID</dt><dd>{selected?.id ?? 'brak'}</dd><dt>Czas</dt><dd>{itemText(selected, 'datetime')}</dd><dt>Platforma</dt><dd>{itemText(selected, 'platform')}</dd><dt>BBOX</dt><dd>{selected?.bbox?.join(', ') ?? 'brak danych'}</dd></dl>{selected && <a className="scene-product-link" href={selected.links?.find(link => link.rel === 'self')?.href ?? 'https://browser.dataspace.copernicus.eu/'} target="_blank" rel="noreferrer">Otwórz rekord produktu</a>}<p className="scene-science-note">Pojedyncze zdjęcie całego bieguna może nie istnieć. Brak pokrycia nie jest sztucznie uzupełniany.</p></aside>
    </div>
  </div>
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewMode>('globe')
  const [layer, setLayer] = useState<Layer>('reference')
  const [error, setError] = useState('')
  const date = useMemo(() => clampDate(selectedTime), [selectedTime])
  const day = date.toISOString().slice(0, 10)

  useEffect(() => {
    if (view !== 'globe' || !host.current) return
    let viewer: any
    let cancelled = false
    loadCesium().then(Cesium => {
      if (cancelled || !host.current) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(host.current, { animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, imageryProvider: false })
      viewerRef.current = viewer
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#18222d')
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80000000
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(15, 20, 20000000) })
      for (const marker of markers.slice(0, 1000)) viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0), point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#ff674f'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND } })
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
    viewer.scene.globe.enableLighting = layer === 'nasa-night'
    const base = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: ESRI_WORLD, maximumLevel: 19, credit: 'Esri World Imagery' }))
    base.alpha = 1

    if (layer === 'copernicus-safe') {
      const safeRectangle = Cesium.Rectangle.fromDegrees(-180, -78, 180, 78)
      const overlay = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({
        url: CDSE_WMS,
        layers: CDSE_LAYER,
        rectangle: safeRectangle,
        parameters: { transparent: true, format: 'image/png', time: `${day}/${day}`, maxcc: 20, showlogo: false },
        credit: 'Copernicus Sentinel-2 — ograniczone do ±78°, bez deformowania biegunów',
      }))
      overlay.alpha = .9
    }
    if (layer === 'nasa-day' || layer === 'nasa-night') {
      const name = layer === 'nasa-day' ? 'VIIRS_SNPP_CorrectedReflectance_TrueColor' : 'VIIRS_SNPP_DayNightBand_ENCC'
      const nasa = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({ url: NASA_WMTS, layer: name, style: 'default', format: layer === 'nasa-day' ? 'image/jpeg' : 'image/png', tileMatrixSetID: 'GoogleMapsCompatible_Level9', maximumLevel: 9, dimensions: { Time: day }, credit: 'NASA EOSDIS GIBS' }))
      nasa.alpha = layer === 'nasa-day' ? .9 : .65
    }
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: ESRI_LABELS, maximumLevel: 12 }))
    viewer.scene.requestRender()
  }, [ready, layer, day, view, date])

  const fly = (lon: number, lat: number, height: number) => { const viewer = viewerRef.current; const Cesium = cesiumRef.current; if (viewer && Cesium) viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, height), duration: 1.2 }) }
  const zoom = (factor: number) => { const viewer = viewerRef.current; if (viewer) viewer.camera.zoomIn(Math.max(500, viewer.camera.positionCartographic.height * factor)) }

  return <div className={`tiled-earth-shell ${view !== 'globe' ? 'is-polar-scene' : ''}`}>
    <div className="tiled-earth-toolbar">
      <button type="button" className={view === 'globe' ? 'is-active' : ''} onClick={() => setView('globe')}>Globus 3D</button>
      <button type="button" className={view === 'north' ? 'is-active' : ''} onClick={() => setView('north')}>Arktyka — pojedyncza scena</button>
      <button type="button" className={view === 'south' ? 'is-active' : ''} onClick={() => setView('south')}>Antarktyda — pojedyncza scena</button>
      {view === 'globe' && <><button type="button" onClick={() => fly(20, 52, 5500000)}>Europa</button><label>Warstwa<select value={layer} onChange={event => setLayer(event.target.value as Layer)}><option value="reference">Satelita szczegółowa — czysty glob</option><option value="copernicus-safe">Copernicus — tylko ±78°, bez biegunów</option><option value="nasa-day">NASA — dzień</option><option value="nasa-night">NASA — noc</option></select></label></>}
      <div className="location-globe-status"><strong>{view === 'globe' ? 'GLOBUS 3D — BEZ DEFORMACJI BIEGUNÓW' : 'TRYB NAUKOWY — JEDEN PRODUKT'}</strong><span>Data: {date.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span><span>{view === 'globe' ? 'Warstwy reprojektowane są odcinane przed strefą polarną. Dokładne obserwacje wykonuj w trybie pojedynczej sceny.' : 'Bez mozaiki i bez sztucznego wypełniania.'}</span>{error && <span className="location-globe-error">{error}</span>}</div>
    </div>
    {view === 'globe' ? <><div className="tiled-earth-zoom"><button type="button" onClick={() => zoom(.45)}>+</button><button type="button" onClick={() => zoom(-.85)}>−</button></div><div className="tiled-earth-attribution">Na globie 3D nie nakładamy Copernicusa na obszary powyżej 78°N ani poniżej 78°S. Dzięki temu nie powstają promieniste linie i sztuczne koła.</div><div ref={host} className="tiled-earth-canvas" /></> : <PolarScene mode={view} date={date} />}
  </div>
}
