import { useEffect, useMemo, useRef, useState } from 'react'
import './location-globe.css'
import './tiled-earth.css'

type Marker = {
  longitude: number
  latitude: number
  color?: number
  radius?: number
}

type UserLocation = {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

type Props = {
  textureUrl?: string
  selectedTime: string
  markers?: Marker[]
  autoRotate?: boolean
}

type CesiumApi = {
  Viewer: new (element: HTMLElement, options: Record<string, unknown>) => any
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => any
  WebMapTileServiceImageryProvider: new (options: Record<string, unknown>) => any
  Cartesian3: { fromDegrees: (longitude: number, latitude: number, height?: number) => any }
  Color: { fromCssColorString: (value: string) => any; WHITE: any; BLACK: any }
  VerticalOrigin: { BOTTOM: any }
  HeightReference: { CLAMP_TO_GROUND: any }
  JulianDate: { fromIso8601: (value: string) => any }
}

declare global {
  interface Window {
    Cesium?: CesiumApi
    CESIUM_BASE_URL?: string
  }
}

const CESIUM_VERSION = '1.126'
const CESIUM_SCRIPT = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Cesium.js`
const CESIUM_CSS = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`
const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_BOUNDARIES =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const NASA_GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
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

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Dostęp do lokalizacji został odrzucony.'
  if (error.code === error.POSITION_UNAVAILABLE) return 'Pozycja jest obecnie niedostępna.'
  if (error.code === error.TIMEOUT) return 'Upłynął czas oczekiwania na pozycję GPS.'
  return 'Nie udało się odczytać lokalizacji.'
}

function clampToNow(value: string, now: Date) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return now
  return parsed.getTime() > now.getTime() ? now : parsed
}

export function RealisticEarthGlobe({ selectedTime, markers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const cesiumRef = useRef<CesiumApi | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const userEntityRef = useRef<any>(null)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [layer, setLayer] = useState<'satellite' | 'nasa-auto' | 'nasa-day' | 'nasa-night'>('nasa-auto')
  const [liveNow, setLiveNow] = useState(() => new Date())

  const selectedDate = useMemo(() => clampToNow(selectedTime, liveNow), [selectedTime, liveNow])
  const liveMode = Math.abs(new Date(selectedTime).getTime() - liveNow.getTime()) <= LIVE_WINDOW_MS
  const effectiveDate = liveMode ? liveNow : selectedDate
  const futureWasClamped = new Date(selectedTime).getTime() > liveNow.getTime()

  useEffect(() => {
    if (!liveMode) return
    const timer = window.setInterval(() => setLiveNow(new Date()), LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [liveMode])

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
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
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        })
        setLocationError(null)
      },
      error => {
        setLocationError(geolocationErrorMessage(error))
        setLocating(false)
      },
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 15_000 },
    )
  }

  const flyTo = (longitude: number, latitude: number, height: number) => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      duration: 1.4,
    })
  }

  const zoom = (factor: number) => {
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
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString('#74ffb8'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: 'Twoja pozycja',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 4,
          style: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: { x: 0, y: -18 },
        },
      })
    } else {
      userEntityRef.current.position = position
    }
  }, [userLocation])

  useEffect(() => {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return

    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(effectiveDate.toISOString())
    viewer.scene.globe.enableLighting = true
    viewer.imageryLayers.removeAll()

    const referenceBase = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: ESRI_WORLD_IMAGERY,
      maximumLevel: 19,
      credit: 'Esri World Imagery — warstwa geometrii i szczegółów terenu',
    }))
    referenceBase.brightness = layer === 'nasa-night' ? 0.42 : 0.72
    referenceBase.contrast = 1.08
    referenceBase.saturation = layer === 'nasa-night' ? 0.45 : 0.85

    if (layer !== 'satellite') {
      const date = effectiveDate.toISOString().slice(0, 10)
      const addNasaLayer = (nasaLayer: string, format: string, alpha: number, credit: string) => {
        const imagery = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapTileServiceImageryProvider({
          url: NASA_GIBS_WMTS,
          layer: nasaLayer,
          style: 'default',
          format,
          tileMatrixSetID: 'GoogleMapsCompatible_Level9',
          maximumLevel: 9,
          dimensions: { Time: date },
          credit,
        }))
        imagery.alpha = alpha
        imagery.brightness = 1.12
        imagery.contrast = 1.08
      }

      if (layer === 'nasa-day') {
        addNasaLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'image/jpeg', 0.9, 'NASA EOSDIS GIBS — VIIRS True Color')
      } else if (layer === 'nasa-night') {
        addNasaLayer('VIIRS_SNPP_DayNightBand_ENCC', 'image/png', 0.78, 'NASA EOSDIS GIBS — VIIRS Day/Night Band')
      } else {
        addNasaLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'image/jpeg', 0.68, 'NASA EOSDIS GIBS — VIIRS True Color')
        addNasaLayer('VIIRS_SNPP_DayNightBand_ENCC', 'image/png', 0.42, 'NASA EOSDIS GIBS — VIIRS Day/Night Band')
      }
    }

    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: ESRI_BOUNDARIES,
      maximumLevel: 12,
      credit: 'Esri boundaries and places',
    }))
  }, [layer, effectiveDate.getTime()])

  useEffect(() => {
    const element = host.current
    if (!element) return
    let cancelled = false
    let viewer: any

    loadCesium().then(Cesium => {
      if (cancelled) return
      cesiumRef.current = Cesium
      viewer = new Cesium.Viewer(element, {
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
        terrainProvider: undefined,
        imageryProvider: false,
      })
      viewerRef.current = viewer
      viewer.scene.globe.enableLighting = true
      viewer.scene.globe.depthTestAgainstTerrain = false
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 80_000_000
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(effectiveDate.toISOString())

      for (const marker of markers.slice(0, 1000)) {
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(marker.longitude, marker.latitude, 0),
          point: {
            pixelSize: Math.max(6, 8 * (marker.radius ?? 1)),
            color: Cesium.Color.fromCssColorString('#ff674f'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        })
      }
      flyTo(15, 20, 20_000_000)
      setLiveNow(new Date())
    }).catch(error => {
      if (!cancelled) setLoadError(String(error instanceof Error ? error.message : error))
    })

    return () => {
      cancelled = true
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
      cesiumRef.current = null
      userEntityRef.current = null
      element.replaceChildren()
    }
  }, [markers])

  const layerLabel = layer === 'satellite'
    ? 'szczegółowa mozaika referencyjna'
    : layer === 'nasa-day'
      ? 'NASA VIIRS True Color na warstwie geometrii'
      : layer === 'nasa-night'
        ? 'NASA VIIRS DNB na przyciemnionej warstwie geometrii'
        : 'NASA dzień i noc z zachowaną geometrią terenu'

  return (
    <div className="tiled-earth-shell">
      <div className="tiled-earth-toolbar">
        <button type="button" onClick={locating ? stopTracking : startTracking}>
          {locating ? 'Zatrzymaj lokalizację' : 'Znajdź mnie'}
        </button>
        <button type="button" onClick={() => userLocation && flyTo(userLocation.longitude, userLocation.latitude, 25_000)} disabled={!userLocation}>
          Przybliż do mojej pozycji
        </button>
        <button type="button" onClick={() => flyTo(0, -90, 5_500_000)}>Antarktyda</button>
        <button type="button" onClick={() => flyTo(20, 52, 5_500_000)}>Europa</button>
        <label>
          Warstwa
          <select value={layer} onChange={event => setLayer(event.target.value as typeof layer)}>
            <option value="nasa-auto">NASA — automatycznie dzień/noc</option>
            <option value="nasa-day">NASA — zdjęcie dzienne</option>
            <option value="nasa-night">NASA — zdjęcie nocne VIIRS DNB</option>
            <option value="satellite">Satelita szczegółowa — mozaika referencyjna</option>
          </select>
        </label>
        <div className="location-globe-status" role="status" aria-live="polite">
          <strong>{liveMode ? 'TRYB TERAZ — kontrola co 5 sekund' : 'TRYB HISTORYCZNY'}</strong>
          <span>Wyświetlany czas: {effectiveDate.toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span>
          <span>Warstwa: {layerLabel}</span>
          {futureWasClamped && <span className="location-globe-error">Data przyszła została cofnięta do aktualnego czasu.</span>}
          {liveMode && <span>Sprawdzamy czas co 5 s; nowy obraz pojawi się dopiero po publikacji przez źródło.</span>}
          {userLocation && (
            <>
              <span>{userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}</span>
              <span>Dokładność GPS: ±{Math.round(userLocation.accuracy)} m</span>
            </>
          )}
          {locationError && <span className="location-globe-error">{locationError}</span>}
          {loadError && <span className="location-globe-error">{loadError}</span>}
        </div>
      </div>
      <div className="tiled-earth-zoom" aria-label="Sterowanie przybliżeniem">
        <button type="button" aria-label="Przybliż" onClick={() => zoom(0.45)}>+</button>
        <button type="button" aria-label="Oddal" onClick={() => zoom(-0.85)}>−</button>
      </div>
      <div className="tiled-earth-attribution">
        Geometria Ziemi pozostaje widoczna także nocą. VIIRS DNB jest nakładką nocną, a nie niebieskim zastępstwem całej powierzchni.
      </div>
      <div ref={host} className="tiled-earth-canvas" aria-label="Kafelkowy glob 3D z widoczną geometrią Ziemi, historycznym czasem oraz warstwami dziennymi i nocnymi NASA" />
    </div>
  )
}
