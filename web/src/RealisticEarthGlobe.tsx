import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { readEarthModel, writeEarthModel, type EarthModel } from './lib/earthPreferences'
import { latLonToCartesian } from './lib/wgs84'
import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }
type ViewPreset = 'full' | 'moon' | 'greenwich' | 'dateline' | 'north' | 'south'

const EARTH_RADIUS = 2
const POLAR_RATIO = 6_356_752.314245 / 6_378_137
const DEFAULT_EARTH_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const DEFAULT_CLOUD_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'

const viewSettings: Record<ViewPreset, { position: [number, number, number]; fov: number; label: string }> = {
  full: { position: [0, 0.18, 6.1], fov: 42, label: 'Pełna tarcza Ziemi' },
  moon: { position: [0, 0.12, 12.5], fov: 18, label: 'Widok z okolic Księżyca' },
  greenwich: { position: [0, 0.15, 5.4], fov: 38, label: 'Południk Greenwich' },
  dateline: { position: [0, 0.15, -5.4], fov: 38, label: 'Linia zmiany daty' },
  north: { position: [0, 6.2, 0.01], fov: 38, label: 'Biegun północny' },
  south: { position: [0, -6.2, 0.01], fov: 38, label: 'Biegun południowy' },
}

export function RealisticEarthGlobe({ textureUrl = DEFAULT_EARTH_TEXTURE, selectedTime, markers = [], autoRotate = true }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const [model, setModel] = useState<EarthModel>('scientific')
  const [status, setStatus] = useState('Uruchamianie modelu 3D…')
  const [showClouds, setShowClouds] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [showAtmosphere, setShowAtmosphere] = useState(true)
  const [showDayNight, setShowDayNight] = useState(true)
  const [view, setView] = useState<ViewPreset>('full')

  useEffect(() => {
    try { setModel(readEarthModel()) } catch { setModel('scientific') }
  }, [])

  useEffect(() => {
    const element = host.current
    if (!element) return

    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null
    let frame = 0
    let resizeObserver: ResizeObserver | null = null

    try {
      element.replaceChildren()
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
      controls.minDistance = 2.18
      controls.maxDistance = 40
      controls.autoRotate = autoRotate && view === 'full'
      controls.autoRotateSpeed = 0.28
      controls.target.set(0, 0, 0)
      controls.update()

      const textureLoader = new THREE.TextureLoader()
      textureLoader.setCrossOrigin('anonymous')
      const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x176aa0, roughness: 0.9, metalness: 0 })
      textureLoader.load(
        textureUrl,
        texture => {
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(16, renderer?.capabilities.getMaxAnisotropy() ?? 1)
          earthMaterial.map = texture
          earthMaterial.color.set(0xffffff)
          earthMaterial.needsUpdate = true
          setStatus(`${model === 'scientific' ? 'Scientific WGS84' : 'Legacy sphere'} — obraz Ziemi działa · ${preset.label}`)
        },
        undefined,
        () => setStatus('Nie udało się pobrać obrazu Ziemi — działa bezpieczny model lokalny'),
      )

      const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 128, 96), earthMaterial)
      if (model === 'scientific') earth.scale.y = POLAR_RATIO
      earth.rotation.set(0, -Math.PI / 2, 0)
      if (view === 'dateline') earth.rotation.y = Math.PI / 2
      scene.add(earth)

      const cloudMaterial = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.42, depthWrite: false })
      textureLoader.load(DEFAULT_CLOUD_TEXTURE, texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        cloudMaterial.map = texture
        cloudMaterial.needsUpdate = true
      })
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.009, 128, 96), cloudMaterial)
      clouds.scale.copy(earth.scale)
      clouds.rotation.copy(earth.rotation)
      clouds.visible = showClouds
      scene.add(clouds)

      const grid = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 48, 24),
        new THREE.MeshBasicMaterial({ color: 0x6bdcff, wireframe: true, transparent: true, opacity: 0.17, depthWrite: false }),
      )
      grid.scale.copy(earth.scale)
      grid.rotation.copy(earth.rotation)
      grid.visible = showGrid
      scene.add(grid)

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.045, 96, 64),
        new THREE.MeshBasicMaterial({ color: 0x54bfff, transparent: true, opacity: 0.13, side: THREE.BackSide, depthWrite: false }),
      )
      atmosphere.scale.copy(earth.scale)
      atmosphere.visible = showAtmosphere
      scene.add(atmosphere)

      const ambient = new THREE.HemisphereLight(0xcfeeff, 0x020711, showDayNight ? 0.34 : 1.35)
      scene.add(ambient)
      const sunlight = new THREE.DirectionalLight(0xffffff, showDayNight ? 3.15 : 1.9)
      sunlight.position.set(5, 2.2, 6)
      scene.add(sunlight)
      const fill = new THREE.DirectionalLight(0x6ca8ff, showDayNight ? 0.08 : 0.52)
      fill.position.set(-5, -1, -5)
      scene.add(fill)

      for (const marker of markers.slice(0, 300)) {
        if (!Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude)) continue
        if (marker.latitude < -90 || marker.latitude > 90 || marker.longitude < -180 || marker.longitude > 180) continue
        const point = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.022, (marker.radius ?? 1) * 0.024), 10, 10),
          new THREE.MeshBasicMaterial({ color: marker.color ?? 0xff674f }),
        )
        point.position.copy(latLonToCartesian(
          marker.latitude,
          marker.longitude,
          model === 'scientific'
            ? { kind: 'wgs84', scale: (EARTH_RADIUS * 1.014) / 6_378_137 }
            : { kind: 'sphere', radius: EARTH_RADIUS * 1.014 },
        ))
        earth.add(point)
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

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(element)
      }
      window.addEventListener('resize', resize)
      requestAnimationFrame(resize)
      setStatus(`${model === 'scientific' ? 'Scientific WGS84' : 'Legacy sphere'} działa — ładowanie obrazu · ${preset.label}`)

      const animate = () => {
        frame = requestAnimationFrame(animate)
        controls?.update()
        if (showClouds) clouds.rotation.y += 0.00012
        grid.rotation.copy(earth.rotation)
        renderer?.render(scene, camera)
      }
      animate()

      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        window.removeEventListener('resize', resize)
        controls?.dispose()
        controlsRef.current = null
        cameraRef.current = null
        scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            const material = object.material
            if (Array.isArray(material)) material.forEach(item => item.dispose())
            else {
              for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
              material.dispose()
            }
          }
        })
        renderer?.dispose()
        element.replaceChildren()
      }
    } catch (error) {
      setStatus(`Błąd renderera 3D: ${error instanceof Error ? error.message : String(error)}`)
      element.innerHTML = '<div class="earth-render-error">Nie udało się uruchomić WebGL. Spróbuj odświeżyć kartę lub zamknąć inne aplikacje.</div>'
      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        controls?.dispose()
        renderer?.dispose()
      }
    }
  }, [model, markers, autoRotate, textureUrl, showClouds, showGrid, showAtmosphere, showDayNight, view])

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
      <button type="button" className={showClouds ? 'is-active' : ''} onClick={() => setShowClouds(value => !value)}>Chmury</button>
      <button type="button" className={showAtmosphere ? 'is-active' : ''} onClick={() => setShowAtmosphere(value => !value)}>Atmosfera</button>
      <button type="button" className={showGrid ? 'is-active' : ''} onClick={() => setShowGrid(value => !value)}>Siatka</button>
      <button type="button" className={showDayNight ? 'is-active' : ''} onClick={() => setShowDayNight(value => !value)}>Realny dzień / noc</button>
      <button type="button" onClick={() => zoom(0.72)}>＋ Przybliż</button>
      <button type="button" onClick={() => zoom(1.38)}>－ Oddal</button>
      <button type="button" onClick={() => setView(current => current === 'full' ? 'moon' : 'full')}>Reset kamery</button>
    </div>
    <p className="earth-model-explainer"><strong>{status}</strong><br/>Przełączniki przebudowują właściwą warstwę modelu. Obracaj jednym palcem, przybliżaj gestem; przyciski zoomu działają również na telefonie.</p>
    <div className="stable-earth-shell">
      <div className="stable-earth-head"><strong>{model === 'scientific' ? 'Ziemia — elipsoida WGS84' : 'Ziemia — kula porównawcza'}</strong><span>{viewSettings[view].label} · {new Date(selectedTime).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span></div>
      <div ref={host} className="stable-earth-canvas" />
      <p className="muted earth-imagery-credit">Warstwa bazowa: globalna mozaika Ziemi używana w przykładach Three.js. Widok z okolic Księżyca jest presetem obserwacyjnym pokazującym całą tarczę wyraźnie, a nie symulacją jej rzeczywistego małego rozmiaru kątowego.</p>
    </div>
  </section>
}
