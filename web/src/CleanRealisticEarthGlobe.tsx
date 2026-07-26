import { useEffect, useMemo, useRef, useState } from 'react'
import './location-globe.css'
import './tiled-earth.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[] }
type ViewMode = 'globe' | 'north' | 'south'
type Layer = 'high-resolution' | 'nasa-day' | 'nasa-night' | 'copernicus-safe'
type Sensor = 'sentinel-1-grd' | 'sentinel-2-l2a' | 'sentinel-3-olci-l1b'
type StacItem = {
  id: string
  bbox?: number[]
  properties?: Record<string, unknown>
  assets?: Record<string, { href?: string; type?: string }>
  links?: Array<{ rel?: string; href?: string }>
}

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

declare global {
  interface Window { Cesium?: CesiumApi; CESIUM_BASE_URL?: string }
}

const CESIUM_VERSION = '1.126'
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const HIGH_RESOLUTION_WORLD = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const NASA_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
const STAC_SEARCH = 'https://stac.dataspace.copernicus.eu/v1/search'
const CDSE_INSTANCE = import.meta.env.VITE_CDSE_INSTANCE_ID || 'd708f736-b553-4328-9b5e-39bdb444790c'
const CDSE_WMS = `https://sh.dataspace.copernicus.eu/ogc/wms/${CDSE_INSTANCE}`

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: [sensor],
        bbox: mode === 'north' ? [-180, 72, 180, 90] : [-180, -90, 180, -72],
        datetime: `${day}T00:00:00Z/${day}T23:59:59Z`,
        limit: 50,
      }),
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`STAC ${response.status}`)))
      .then(data => {
        const found = Array.isArray(data.features) ? data.features as StacItem[] : []
        setItems(found)
        setSelectedId(found[0]?.id ?? '')
        if (!found.length) setError('Brak pojedynczej sceny dla tego dnia. Zmień datę lub sensor.')
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(String(reason))
      })
    return () => controller.abort()
  }, [mode, sensor, day])

  return <div className="original-scene-module">
    <div className="scene-controls">
      <label>Sensor<select value={sensor} onChange={event => setSensor(event.target.value as Sensor)}>
        <option value="sentinel-2-l2a">Sentinel-2 — prawdziwy kolor</option>
        <option value="sentinel-1-grd">Sentinel-1 — radar</option>
        <option value="sentinel-3-olci-l1b">Sentinel-3 — szeroki obraz</option>
      </select></label>
      <label>Oryginalny produkt<select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>
        {items.map(item => <option key={item.id}>{item.id}</option>)}
      </select></label>
      <button type="button" onClick={() => setZoom(value => Math.min(12, value * 1.35))}>+</button>
      <button type="button" onClick={() => setZoom(value => Math.max(.5, value / 1.35))}>−</button>
      <button type="button" onClick={() => setZoom(1)}>Reset</button>
    </div>
    <div className="scene-status">
      <strong>{mode === 'north' ? 'Arktyka' : 'Antarktyda'} — autentyczna scena satelitarna</strong>
      <span>Bez sztucznej kuli i bez generowania brakujących pikseli.</span>
    </div>
    <div className="scene-layout">
      <div className="scene-canvas">
        {error && <div className="scene-message scene-error">{error}</div>}
        {selected && image && <div className="scene-image-frame" style={{ transform: `scale(${zoom})` }}><img src={image} alt={selected.id} /></div>}
        {selected && !image && !error && <div className="scene-message">Produkt istnieje, ale katalog nie udostępnia publicznego podglądu.</div>}
      </div>
      <aside className="scene-metadata">
        <h3>Metadane</h3>
        <p><b>ID:</b> {selected?.id ?? 'brak'}</p>
        <p><b>Czas:</b> {String(selected?.properties?.datetime ?? 'brak')}</p>
        <p><b>BBOX:</b> {selected?.bbox?.join(', ') ?? 'brak'}</p>
        {selected && <a className="scene-product-link" href={selected.links?.find(link => link.rel === 'self')?.href ?? 'https://browser.dataspace.copernicus.eu/'} target="_blank" rel="noreferrer">Otwórz oryginalny produkt</a>}
      </aside>
    </div>
  </div>
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewMode>('globe')
  const [layer, setLayer] = useState<Layer>('high-resolution')
  const [nightVision, setNightVision] = useState(false)
  const [live, setLive] = useState(true)
  const [solarLighting, setSolarLighting] = useState(false)
  const [error, setError] = useState('')
  const date = useMemo(() => live ? new Date() : new Date(selectedTime), [live, selectedTime])
  const day = date.toISOString().slice(0, 10)

  useEffect(() => {
    if (view !== 'globe' || !host.current) return
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
        maximumRenderTimeChange: Infinity,
      })
      viewerRef.current = viewer
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#02060a')
      viewer.scene.globe.enableLighting = false
      viewer.scene.globe.maximumScreenSpaceError = 1
      viewer.scene.globe.tileCacheSize = 500
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.globe.showGroundAtmosphere = true
      viewer.scene.fog.enabled = true
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 25
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80000000
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(15, 15, 21000000) })
      for (const marker of markers.slice(0, 500)) {
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0),
          point: {
            pixelSize: 7,
            color: Cesium.Color.fromCssColorString('#ff674f'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        })
      }
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
  }, [view, markers])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium || view !== 'globe') return

    viewer.imageryLayers.removeAll()
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(date.toISOString())

    const detailedBase = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: HIGH_RESOLUTION_WORLD,
      minimumLevel: 0,
      maximumLevel: 19,
      credit: 'Esri World Imagery — szczegółowa warstwa bazowa',
    }))
    detailedBase.alpha = 1
    detailedBase.brightness = 1
    detailedBase.contrast = 1.03
    detailedBase.saturation = 1

    if (layer === 'nasa-day' || layer === 'nasa-night') {
      const nasaLayer = layer === 'nasa-night' ? 'VIIRS_SNPP_DayNightBand_ENCC' : 'VIIRS_SNPP_CorrectedReflectance_TrueColor'
      const nasa = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({
        url: NASA_WMTS,
        layer: nasaLayer,
        style: 'default',
        format: layer === 'nasa-night' ? 'image/png' : 'image/jpeg',
        tileMatrixSetID: 'GoogleMapsCompatible_Level9',
        maximumLevel: 9,
        dimensions: { Time: day },
        credit: 'NASA EOSDIS GIBS',
      }))
      nasa.alpha = layer === 'nasa-night' ? .72 : .82
    }

    if (layer === 'copernicus-safe') {
      const copernicus = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({
        url: CDSE_WMS,
        layers: import.meta.env.VITE_CDSE_LAYER || 'NATURAL-COLOR',
        rectangle: Cesium.Rectangle.fromDegrees(-180, -78, 180, 78),
        parameters: {
          transparent: true,
          format: 'image/png',
          time: `${day}/${day}`,
          maxcc: 20,
          showlogo: false,
        },
        credit: 'Copernicus Data Space',
      }))
      copernicus.alpha = .9
    }

    viewer.scene.globe.enableLighting = solarLighting
    viewer.scene.highDynamicRange = true
    viewer.scene.postProcessStages.fxaa.enabled = true
    viewer.scene.requestRender()
  }, [ready, layer, day, view, date, solarLighting])

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
        <label>Obraz<select value={layer} onChange={event => setLayer(event.target.value as Layer)}>
          <option value="high-resolution">Szczegółowa mapa satelitarna — duży zoom</option>
          <option value="nasa-day">NASA VIIRS — prawdziwy kolor</option>
          <option value="nasa-night">NASA VIIRS — nocne światła</option>
          <option value="copernicus-safe">Copernicus — aktualna obserwacja</option>
        </select></label>
        <label><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} /> czas rzeczywisty</label>
        <label><input type="checkbox" checked={solarLighting} onChange={event => setSolarLighting(event.target.checked)} /> cień dnia i nocy</label>
        <label><input type="checkbox" checked={nightVision} onChange={event => setNightVision(event.target.checked)} /> noktowizor</label>
      </>}
      <div className="location-globe-status">
        <strong>PEŁNA ZIEMIA · SZCZEGÓŁOWE KAFELKI DO POZIOMU 19</strong>
        <span>{date.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span>
        <span>NASA pokazuje aktualność globalną, a warstwa szczegółowa uzupełnia brakujące obszary i zachowuje ostrość przy przybliżaniu.</span>
        {error && <span>{error}</span>}
      </div>
    </div>
    {view === 'globe' ? <>
      <div className="tiled-earth-zoom">
        <button type="button" aria-label="Przybliż" onClick={() => zoom(.45)}>+</button>
        <button type="button" aria-label="Oddal" onClick={() => zoom(-.85)}>−</button>
      </div>
      <div ref={host} className="tiled-earth-canvas" />
    </> : <PolarScene mode={view} date={date} />}
  </div>
}
