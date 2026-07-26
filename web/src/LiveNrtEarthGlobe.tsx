import { useEffect, useMemo, useRef, useState } from 'react'
import './tiled-earth.css'
import './location-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[] }
type Mode = 'live-clouds' | 'live-fire' | 'daily-true-color' | 'high-resolution'

type CesiumApi = {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => any
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => any
  WebMapServiceImageryProvider: new (options: Record<string, unknown>) => any
  WebMapTileServiceImageryProvider: new (options: Record<string, unknown>) => any
  Cartesian3: { fromDegrees: (longitude: number, latitude: number, height?: number) => any }
  Color: { fromCssColorString: (value: string) => any; BLACK: any }
  HeightReference: { CLAMP_TO_GROUND: any }
  JulianDate: { fromIso8601: (value: string) => any }
}

type CesiumWindow = Window & typeof globalThis & {
  Cesium?: CesiumApi
  CESIUM_BASE_URL?: string
}

const CESIUM_VERSION = '1.126'
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const NASA_NRT_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/nrt/wms.cgi'
const NASA_BEST_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
const HIGH_RESOLUTION_WORLD = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const TEN_MINUTES = 10 * 60 * 1000

function floorTenMinutes(date: Date) {
  return new Date(Math.floor(date.getTime() / TEN_MINUTES) * TEN_MINUTES)
}

function cesiumWindow(): CesiumWindow {
  return window as CesiumWindow
}

function loadCesium(): Promise<CesiumApi> {
  const browser = cesiumWindow()
  if (browser.Cesium) return Promise.resolve(browser.Cesium)
  browser.CESIUM_BASE_URL = CESIUM_BASE
  if (!document.querySelector(`link[href="${CESIUM_BASE}Widgets/widgets.css"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${CESIUM_BASE}Widgets/widgets.css`
    document.head.append(link)
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CESIUM_BASE}Cesium.js"]`)
    if (existing) {
      existing.addEventListener('load', () => {
        const Cesium = cesiumWindow().Cesium
        if (Cesium) resolve(Cesium)
        else reject(new Error('Cesium unavailable'))
      }, { once: true })
      existing.addEventListener('error', () => reject(new Error('Nie udało się załadować Cesium')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `${CESIUM_BASE}Cesium.js`
    script.async = true
    script.onload = () => {
      const Cesium = cesiumWindow().Cesium
      if (Cesium) resolve(Cesium)
      else reject(new Error('Cesium unavailable'))
    }
    script.onerror = () => reject(new Error('Nie udało się załadować Cesium'))
    document.head.append(script)
  })
}

export function LiveNrtEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('live-clouds')
  const [lagMinutes, setLagMinutes] = useState(40)
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState('Ładowanie danych NASA GIBS NRT…')
  const [nightVision, setNightVision] = useState(false)
  const [solarLighting, setSolarLighting] = useState(true)

  const frameTime = useMemo(() => floorTenMinutes(new Date(now - lagMinutes * 60_000)), [now, lagMinutes])
  const dailyTime = useMemo(() => new Date(selectedTime).toISOString().slice(0, 10), [selectedTime])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!host.current) return
    let viewer: any
    let cancelled = false
    loadCesium().then(Cesium => {
      if (cancelled || !host.current) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(host.current, {
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: false,
        imageryProvider: false, requestRenderMode: false,
      })
      viewerRef.current = viewer
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#02060a')
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.globe.showGroundAtmosphere = true
      viewer.scene.fog.enabled = true
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80_000_000
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-3.7, 40.4, 11_000_000) })
      markers.slice(0, 500).forEach(marker => viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0),
        point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#ff4b2f'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
      }))
      setReady(true)
    }).catch(error => setStatus(String(error)))
    return () => {
      cancelled = true
      setReady(false)
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
      cesiumRef.current = null
      host.current?.replaceChildren()
    }
  }, [markers])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!ready || !viewer || !Cesium) return
    viewer.imageryLayers.removeAll()
    const frameIso = frameTime.toISOString()
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(frameIso)

    if (mode === 'high-resolution') {
      viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: `${HIGH_RESOLUTION_WORLD}?v=${refreshKey}`,
        minimumLevel: 0,
        maximumLevel: 23,
        credit: 'Esri World Imagery — warstwa archiwalna, nie live',
      }))
      setStatus('Tryb wysokiej rozdzielczości korzysta z obrazu archiwalnego. Nie jest to klatka na żywo.')
    } else if (mode === 'daily-true-color') {
      viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({
        url: NASA_BEST_WMTS,
        layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
        style: 'default', format: 'image/jpeg', tileMatrixSetID: 'GoogleMapsCompatible_Level9',
        maximumLevel: 9, dimensions: { Time: dailyTime, refresh: String(refreshKey) },
        credit: 'NASA GIBS VIIRS — dzienna obserwacja',
      }))
      setStatus(`NASA VIIRS — obserwacja dzienna ${dailyTime}. To nie jest obraz sekundowy.`)
    } else {
      const layers = mode === 'live-fire'
        ? ['GOES-East_ABI_GeoColor', 'GOES-East_ABI_FireTemp']
        : ['GOES-East_ABI_GeoColor']
      const provider = new Cesium.WebMapServiceImageryProvider({
        url: NASA_NRT_WMS,
        layers: layers.join(','),
        parameters: {
          transparent: false,
          format: 'image/png',
          time: frameIso,
          cachebuster: `${frameIso}-${refreshKey}`,
        },
        credit: mode === 'live-fire' ? 'NASA GIBS NRT · GOES-East GeoColor + FireTemp' : 'NASA GIBS NRT · GOES-East GeoColor',
      })
      provider.errorEvent?.addEventListener?.(() => setStatus(`Brak klatki ${frameIso}. Zwiększ opóźnienie do 60 minut i odśwież.`))
      viewer.imageryLayers.addImageryProvider(provider)
      setStatus(`Zażądana oryginalna klatka NASA GIBS NRT: ${frameIso}. Automatyczne odświeżanie co 10 minut; bufor publikacji ${lagMinutes} min.`)
    }

    viewer.scene.globe.enableLighting = solarLighting
    viewer.scene.highDynamicRange = true
    viewer.scene.requestRender()
  }, [ready, mode, frameTime, dailyTime, lagMinutes, refreshKey, solarLighting])

  const zoom = (factor: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    const height = viewer.camera.positionCartographic.height
    viewer.camera.zoomIn(factor > 0 ? Math.max(1, height * factor) : Math.min(-1, height * factor))
  }

  return <div className={`tiled-earth-shell ${nightVision ? 'night-vision' : ''}`}>
    <div className="tiled-earth-toolbar">
      <label>Obraz<select value={mode} onChange={event => setMode(event.target.value as Mode)}>
        <option value="live-clouds">NASA NRT — aktualne chmury GOES-East</option>
        <option value="live-fire">NASA NRT — chmury + temperatura pożarowa</option>
        <option value="daily-true-color">NASA VIIRS — prawdziwy kolor dzienny</option>
        <option value="high-resolution">Obraz szczegółowy — archiwalny, nie live</option>
      </select></label>
      {(mode === 'live-clouds' || mode === 'live-fire') && <label>Bufor publikacji<select value={lagMinutes} onChange={event => setLagMinutes(Number(event.target.value))}>
        <option value="20">20 minut</option><option value="40">40 minut</option><option value="60">60 minut</option><option value="90">90 minut</option>
      </select></label>}
      <button type="button" onClick={() => { setNow(Date.now()); setRefreshKey(value => value + 1) }}>↻ Pobierz nową klatkę</button>
      <label><input type="checkbox" checked={solarLighting} onChange={event => setSolarLighting(event.target.checked)} /> dzień/noc</label>
      <label><input type="checkbox" checked={nightVision} onChange={event => setNightVision(event.target.checked)} /> noktowizor</label>
      <div className="location-globe-status"><strong>ORYGINALNE DANE ŹRÓDŁOWE — BEZ UDAWANIA LIVE</strong><span>{status}</span><span>Czas interfejsu: {new Date(now).toISOString()}</span></div>
    </div>
    <div className="tiled-earth-zoom"><button type="button" onClick={() => zoom(.55)}>+</button><button type="button" onClick={() => zoom(-.7)}>−</button></div>
    <div ref={host} className="tiled-earth-canvas" />
  </div>
}
