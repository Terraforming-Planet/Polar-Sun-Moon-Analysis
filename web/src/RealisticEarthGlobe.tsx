import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { readEarthModel, writeEarthModel, type EarthModel } from './lib/earthPreferences'
import { latLonToCartesian } from './lib/wgs84'
import {
  SATELLITE_SOURCES,
  sourceForMode,
  zoomLevelFromDistance,
  type SatelliteSourceMode,
} from './lib/satelliteSources'
import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }
type ViewPreset = 'full' | 'moon' | 'greenwich' | 'dateline' | 'north' | 'south'

const EARTH_RADIUS = 2
const POLAR_RATIO = 6_356_752.314245 / 6_378_137
const DEFAULT_EARTH_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const DEFAULT_CLOUD_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'
const SIDEREAL_DAY_SECONDS = 86_164.0905
const MOBILE_MARKER_LIMIT = 2_500
const DESKTOP_MARKER_LIMIT = 10_000

const viewSettings: Record<ViewPreset, { position: [number, number, number]; fov: number; label: string }> = {
  full: { position: [0, 0.18, 6.1], fov: 42, label: 'Pełna tarcza Ziemi' },
  moon: { position: [0, 0.12, 12.5], fov: 18, label: 'Widok z okolic Księżyca' },
  greenwich: { position: [0, 0.15, 5.4], fov: 38, label: 'Południk Greenwich' },
  dateline: { position: [0, 0.15, -5.4], fov: 38, label: 'Linia zmiany daty' },
  north: { position: [0, 6.2, 0.01], fov: 38, label: 'Biegun północny' },
  south: { position: [0, -6.2, 0.01], fov: 38, label: 'Biegun południowy' },
}

function utcEarthAngle(iso: string) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 0
  const seconds = ms / 1000
  return ((seconds % SIDEREAL_DAY_SECONDS) / SIDEREAL_DAY_SECONDS) * Math.PI * 2
}

function validMarker(marker: Marker) {
  return Number.isFinite(marker.latitude)
    && Number.isFinite(marker.longitude)
    && marker.latitude >= -90
    && marker.latitude <= 90
    && marker.longitude >= -180
    && marker.longitude <= 180
}

export function RealisticEarthGlobe({ textureUrl = DEFAULT_EARTH_TEXTURE, selectedTime, markers = [], autoRotate = true }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cloudsRef = useRef<THREE.Mesh | null>(null)
  const gridRef = useRef<THREE.Mesh | null>(null)
  const atmosphereRef = useRef<THREE.Group | null>(null)
  const hemisphereRef = useRef<THREE.HemisphereLight | null>(null)
  const sunlightRef = useRef<THREE.DirectionalLight | null>(null)
  const fillRef = useRef<THREE.DirectionalLight | null>(null)
  const rotationEnabledRef = useRef(autoRotate)
  const liveAngleRef = useRef(utcEarthAngle(selectedTime) - Math.PI / 2)

  const [model, setModel] = useState<EarthModel>('scientific')
  const [status, setStatus] = useState('Uruchamianie modelu 3D…')
  const [showClouds, setShowClouds] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [showAtmosphere, setShowAtmosphere] = useState(true)
  const [showDayNight, setShowDayNight] = useState(true)
  const [rotationEnabled, setRotationEnabled] = useState(autoRotate)
  const [view, setView] = useState<ViewPreset>('full')
  const [sourceMode, setSourceMode] = useState<SatelliteSourceMode>('auto')
  const [logicalZoom, setLogicalZoom] = useState(4)

  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)
  const markerLimit = mobile ? MOBILE_MARKER_LIMIT : DESKTOP_MARKER_LIMIT
  const renderedMarkers = useMemo(
    () => markers.filter(validMarker).slice(0, markerLimit),
    [markers, markerLimit],
  )

  const selectedSource = useMemo(() => sourceForMode(sourceMode, {
    zoom: logicalZoom,
    hasCoverage: true,
    mobile,
  }), [sourceMode, logicalZoom, mobile])

  useEffect(() => {
    try { setModel(readEarthModel()) } catch { setModel('scientific') }
  }, [])

  useEffect(() => {
    rotationEnabledRef.current = rotationEnabled
  }, [rotationEnabled])

  useEffect(() => {
    liveAngleRef.current = utcEarthAngle(selectedTime) - Math.PI / 2
  }, [selectedTime])

  useEffect(() => {
    if (cloudsRef.current) cloudsRef.current.visible = showClouds
  }, [showClouds])

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid
  }, [showGrid])

  useEffect(() => {
    if (atmosphereRef.current) atmosphereRef.current.visible = showAtmosphere
  }, [showAtmosphere])

  useEffect(() => {
    if (hemisphereRef.current) hemisphereRef.current.intensity = showDayNight ? 0.34 : 1.35
    if (sunlightRef.current) sunlightRef.current.intensity = showDayNight ? 3.15 : 1.9
    if (fillRef.current) fillRef.current.intensity = showDayNight ? 0.08 : 0.52
  }, [showDayNight])

  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const preset = viewSettings[view]
    camera.position.set(...preset.position)
    camera.fov = preset.fov
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()
  }, [view])

  useEffect(() => {
    const element = host.current
    if (!element) return

    let frame = 0
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let resizeObserver: ResizeObserver | null = null

    element.replaceChildren()

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
      renderer.setClearColor(0x01050c, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.18
      element.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const preset = viewSettings[view]
      const camera = new THREE.PerspectiveCamera(preset.fov, 1, 0.01, 100)
      camera.position.set(...preset.position)
      cameraRef.current = camera

      controls = new OrbitControls(camera, renderer.domElement)
      controlsRef.current = controls
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.enablePan = true
      controls.panSpeed = 0.35
      controls.rotateSpeed = 0.65
      controls.zoomSpeed = 1.15
      controls.minDistance = 2.05
      controls.maxDistance = 40
      controls.autoRotate = false
      controls.target.set(0, 0, 0)
      controls.update()

      const updateLogicalZoom = () => {
        const next = zoomLevelFromDistance(camera.position.distanceTo(controls!.target), EARTH_RADIUS, mobile)
        setLogicalZoom(current => current === next ? current : next)
      }
      controls.addEventListener('change', updateLogicalZoom)
      updateLogicalZoom()

      const loader = new THREE.TextureLoader()
      loader.setCrossOrigin('anonymous')
      const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x176aa0, roughness: 0.9, metalness: 0 })
      loader.load(textureUrl, texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = Math.min(16, renderer?.capabilities.getMaxAnisotropy() ?? 1)
        earthMaterial.map = texture
        earthMaterial.color.set(0xffffff)
        earthMaterial.needsUpdate = true
        setStatus(`${model === 'scientific' ? 'Scientific WGS84' : 'Legacy sphere'} — GPU markers: ${renderedMarkers.length}`)
      }, undefined, () => setStatus('Nie udało się pobrać tekstury bazowej Ziemi'))

      const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 128, 96), earthMaterial)
      if (model === 'scientific') earth.scale.y = POLAR_RATIO
      scene.add(earth)

      const cloudMaterial = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.42, depthWrite: false })
      loader.load(DEFAULT_CLOUD_TEXTURE, texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        cloudMaterial.map = texture
        cloudMaterial.needsUpdate = true
      })
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.009, 128, 96), cloudMaterial)
      clouds.scale.copy(earth.scale)
      clouds.visible = showClouds
      cloudsRef.current = clouds
      scene.add(clouds)

      const grid = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 48, 24),
        new THREE.MeshBasicMaterial({ color: 0x6bdcff, wireframe: true, transparent: true, opacity: 0.17, depthWrite: false }),
      )
      grid.scale.copy(earth.scale)
      grid.visible = showGrid
      gridRef.current = grid
      scene.add(grid)

      const atmosphere = new THREE.Group()
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.055, 128, 96),
        new THREE.MeshBasicMaterial({ color: 0x38a9ff, transparent: true, opacity: 0.34, side: THREE.BackSide, depthWrite: false }),
      )
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.095, 96, 64),
        new THREE.MeshBasicMaterial({ color: 0x7bd5ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }),
      )
      inner.scale.copy(earth.scale)
      outer.scale.copy(earth.scale)
      atmosphere.add(inner, outer)
      atmosphere.visible = showAtmosphere
      atmosphereRef.current = atmosphere
      scene.add(atmosphere)

      const hemisphere = new THREE.HemisphereLight(0xcfeeff, 0x020711, showDayNight ? 0.34 : 1.35)
      hemisphereRef.current = hemisphere
      scene.add(hemisphere)
      const sunlight = new THREE.DirectionalLight(0xffffff, showDayNight ? 3.15 : 1.9)
      sunlight.position.set(5, 2.2, 6)
      sunlightRef.current = sunlight
      scene.add(sunlight)
      const fill = new THREE.DirectionalLight(0x6ca8ff, showDayNight ? 0.08 : 0.52)
      fill.position.set(-5, -1, -5)
      fillRef.current = fill
      scene.add(fill)

      if (renderedMarkers.length) {
        const markerGeometry = new THREE.SphereGeometry(1, 8, 8)
        const markerMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
        const markerInstances = new THREE.InstancedMesh(markerGeometry, markerMaterial, renderedMarkers.length)
        markerInstances.instanceMatrix.setUsage(THREE.StaticDrawUsage)
        markerInstances.frustumCulled = true

        const transform = new THREE.Object3D()
        const color = new THREE.Color()
        renderedMarkers.forEach((marker, index) => {
          const position = latLonToCartesian(
            marker.latitude,
            marker.longitude,
            model === 'scientific'
              ? { kind: 'wgs84', scale: (EARTH_RADIUS * 1.018) / 6_378_137 }
              : { kind: 'sphere', radius: EARTH_RADIUS * 1.018 },
          )
          const radius = Math.max(0.010, Math.min(0.020, (marker.radius ?? 1) * 0.012))
          transform.position.copy(position)
          transform.scale.setScalar(radius)
          transform.updateMatrix()
          markerInstances.setMatrixAt(index, transform.matrix)
          markerInstances.setColorAt(index, color.setHex(marker.color ?? 0xff2d2d))
        })
        markerInstances.instanceMatrix.needsUpdate = true
        if (markerInstances.instanceColor) markerInstances.instanceColor.needsUpdate = true
        earth.add(markerInstances)
      }

      const resize = () => {
        if (!renderer) return
        const width = Math.max(280, element.getBoundingClientRect().width || window.innerWidth - 32)
        const height = Math.max(500, Math.min(760, window.innerHeight * 0.72))
        element.style.height = `${height}px`
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(element)
      window.addEventListener('resize', resize)
      resize()

      let previous = performance.now()
      const animate = (now: number) => {
        frame = requestAnimationFrame(animate)
        const elapsedSeconds = Math.max(0, (now - previous) / 1000)
        previous = now
        if (rotationEnabledRef.current) {
          liveAngleRef.current += elapsedSeconds * (Math.PI * 2 / SIDEREAL_DAY_SECONDS)
        }
        earth.rotation.y = liveAngleRef.current
        clouds.rotation.y = liveAngleRef.current
        grid.rotation.y = liveAngleRef.current
        controls?.update()
        renderer?.render(scene, camera)
      }
      frame = requestAnimationFrame(animate)

      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        window.removeEventListener('resize', resize)
        controls?.removeEventListener('change', updateLogicalZoom)
        controls?.dispose()
        controlsRef.current = null
        cameraRef.current = null
        cloudsRef.current = null
        gridRef.current = null
        atmosphereRef.current = null
        hemisphereRef.current = null
        sunlightRef.current = null
        fillRef.current = null
        scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            const material = object.material
            if (Array.isArray(material)) material.forEach(item => item.dispose())
            else material.dispose()
          }
        })
        renderer?.dispose()
        element.replaceChildren()
      }
    } catch (error) {
      setStatus(`Błąd renderera 3D: ${error instanceof Error ? error.message : String(error)}`)
      element.innerHTML = '<div class="earth-render-error">Nie udało się uruchomić WebGL.</div>'
      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        controls?.dispose()
        renderer?.dispose()
      }
    }
  }, [model, renderedMarkers, textureUrl, mobile])

  const selectModel = (next: EarthModel) => {
    setModel(next)
    try { writeEarthModel(next) } catch { /* localStorage can be blocked */ }
  }

  const zoom = (factor: number) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const direction = camera.position.clone().sub(controls.target)
    const nextDistance = THREE.MathUtils.clamp(direction.length() * factor, controls.minDistance, controls.maxDistance)
    camera.position.copy(controls.target.clone().add(direction.normalize().multiplyScalar(nextDistance)))
    controls.update()
  }

  return <section className="earth-viewer-stack" aria-label="Główny model Ziemi 3D">
    <div className="earth-model-switch" role="group" aria-label="Wybór modelu Ziemi">
      <button type="button" className={model === 'scientific' ? 'is-active' : ''} onClick={() => selectModel('scientific')}>Scientific WGS84</button>
      <button type="button" className={model === 'legacy' ? 'is-active' : ''} onClick={() => selectModel('legacy')}>Legacy sphere</button>
    </div>
    <div className="earth-view-presets" role="group" aria-label="Widoki kamery Ziemi">
      {(Object.keys(viewSettings) as ViewPreset[]).map(key => <button key={key} type="button" className={view === key ? 'is-active' : ''} onClick={() => setView(key)}>{viewSettings[key].label}</button>)}
    </div>
    <div className="earth-layer-switch" role="group" aria-label="Warstwy modelu Ziemi">
      <button type="button" className={rotationEnabled ? 'is-active' : ''} onClick={() => setRotationEnabled(value => !value)}>{rotationEnabled ? '⏸ Zatrzymaj Ziemię i chmury' : '▶ Wznów synchronizację'}</button>
      <button type="button" className={showClouds ? 'is-active' : ''} onClick={() => setShowClouds(value => !value)}>Chmury</button>
      <button type="button" className={showAtmosphere ? 'is-active' : ''} onClick={() => setShowAtmosphere(value => !value)}>Atmosfera</button>
      <button type="button" className={showGrid ? 'is-active' : ''} onClick={() => setShowGrid(value => !value)}>Siatka</button>
      <button type="button" className={showDayNight ? 'is-active' : ''} onClick={() => setShowDayNight(value => !value)}>Realny dzień / noc</button>
      <button type="button" onClick={() => zoom(0.72)}>＋ Przybliż</button>
      <button type="button" onClick={() => zoom(1.38)}>－ Oddal</button>
      <button type="button" onClick={() => setView('full')}>Reset kamery</button>
    </div>
    <div className="earth-model-switch" role="group" aria-label="Wybór źródła satelitarnego">
      <button type="button" className={sourceMode === 'auto' ? 'is-active' : ''} onClick={() => setSourceMode('auto')}>AUTO — najlepsze dostępne</button>
      {SATELLITE_SOURCES.map(source => <button key={source.id} type="button" className={sourceMode === source.id ? 'is-active' : ''} onClick={() => setSourceMode(source.id)}>{source.label}</button>)}
    </div>
    <p className="earth-model-explainer">
      <strong>{status}</strong><br/>
      Markery zagrożeń są renderowane jednym GPU InstancedMesh: <strong>{renderedMarkers.length}</strong> z {markers.length} poprawnych lub dostarczonych rekordów.
      <br/>Aktywny wybór LOD {logicalZoom}: <strong>{selectedSource.label}</strong> · {selectedSource.product} · około {selectedSource.resolutionMeters} m/piksel.
      <br/>Przełączniki obrotu, chmur, atmosfery, siatki i oświetlenia aktualizują istniejącą scenę WebGL bez niszczenia canvasa. Obraz nadal pozostaje teksturą bazową 2K do czasu podłączenia renderera kafelkowego.
    </p>
    <div className="stable-earth-shell">
      <div className="stable-earth-head"><strong>{model === 'scientific' ? 'Ziemia — elipsoida WGS84' : 'Ziemia — kula porównawcza'}</strong><span>{viewSettings[view].label} · {new Date(selectedTime).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span></div>
      <div ref={host} className="stable-earth-canvas" />
      <p className="muted earth-imagery-credit">Orientacja Ziemi i chmur jest liczona z wybranego czasu UTC. Pauza zatrzymuje zegar obrotu bez przebudowy sceny i bez utraty ustawienia kamery.</p>
    </div>
  </section>
}
