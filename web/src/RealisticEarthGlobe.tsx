import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { readEarthModel, writeEarthModel, type EarthModel } from './lib/earthPreferences'
import { latLonToCartesian } from './lib/wgs84'
import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }

const EARTH_RADIUS = 2
const POLAR_RATIO = 6_356_752.314245 / 6_378_137
const DEFAULT_EARTH_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const DEFAULT_CLOUD_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'

export function RealisticEarthGlobe({ textureUrl = DEFAULT_EARTH_TEXTURE, selectedTime, markers = [], autoRotate = true }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [model, setModel] = useState<EarthModel>('scientific')
  const [status, setStatus] = useState('Uruchamianie modelu 3D…')
  const [showClouds, setShowClouds] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [showAtmosphere, setShowAtmosphere] = useState(true)
  const [showTerminator, setShowTerminator] = useState(true)

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
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' })
      renderer.setClearColor(0x020914, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      element.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
      camera.position.set(0, 0.35, 6.4)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.enablePan = false
      controls.minDistance = 2.8
      controls.maxDistance = 14
      controls.autoRotate = autoRotate
      controls.autoRotateSpeed = 0.35

      const textureLoader = new THREE.TextureLoader()
      textureLoader.setCrossOrigin('anonymous')

      const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x176aa0, roughness: 0.88, metalness: 0 })
      textureLoader.load(
        textureUrl,
        texture => {
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1)
          earthMaterial.map = texture
          earthMaterial.color.set(0xffffff)
          earthMaterial.needsUpdate = true
          setStatus(model === 'scientific' ? 'Scientific WGS84 — prawdziwa tekstura Ziemi działa' : 'Legacy sphere — prawdziwa tekstura Ziemi działa')
        },
        undefined,
        () => setStatus('Nie udało się pobrać obrazu Ziemi — działa bezpieczny model lokalny'),
      )

      const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 96, 64), earthMaterial)
      if (model === 'scientific') earth.scale.y = POLAR_RATIO
      earth.rotation.set(0.08, -0.35, -0.08)
      scene.add(earth)

      const cloudMaterial = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.5, depthWrite: false })
      textureLoader.load(DEFAULT_CLOUD_TEXTURE, texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        cloudMaterial.map = texture
        cloudMaterial.needsUpdate = true
      })
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 96, 64), cloudMaterial)
      clouds.scale.copy(earth.scale)
      clouds.rotation.copy(earth.rotation)
      clouds.visible = showClouds
      scene.add(clouds)

      const grid = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.011, 36, 18),
        new THREE.MeshBasicMaterial({ color: 0x62d7ff, wireframe: true, transparent: true, opacity: 0.2 }),
      )
      grid.scale.copy(earth.scale)
      grid.rotation.copy(earth.rotation)
      grid.visible = showGrid
      scene.add(grid)

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.04, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x54bfff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }),
      )
      atmosphere.scale.copy(earth.scale)
      atmosphere.visible = showAtmosphere
      scene.add(atmosphere)

      const terminator = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.003, 96, 64, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x000716, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
      )
      terminator.scale.copy(earth.scale)
      terminator.rotation.copy(earth.rotation)
      terminator.visible = showTerminator
      scene.add(terminator)

      scene.add(new THREE.HemisphereLight(0xbfe7ff, 0x07111f, 1.25))
      const light = new THREE.DirectionalLight(0xffffff, 2.35)
      light.position.set(5, 3.5, 5)
      scene.add(light)

      for (const marker of markers.slice(0, 150)) {
        if (!Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude)) continue
        if (marker.latitude < -90 || marker.latitude > 90 || marker.longitude < -180 || marker.longitude > 180) continue
        const point = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.025, (marker.radius ?? 1) * 0.025), 8, 8),
          new THREE.MeshBasicMaterial({ color: marker.color ?? 0xff674f }),
        )
        point.position.copy(latLonToCartesian(
          marker.latitude,
          marker.longitude,
          model === 'scientific'
            ? { kind: 'wgs84', scale: (EARTH_RADIUS * 1.012) / 6_378_137 }
            : { kind: 'sphere', radius: EARTH_RADIUS * 1.012 },
        ))
        earth.add(point)
      }

      const resize = () => {
        if (!renderer) return
        const width = Math.max(280, element.getBoundingClientRect().width || window.innerWidth - 32)
        const height = Math.max(420, Math.min(620, window.innerHeight * 0.64))
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
      setStatus(model === 'scientific' ? 'Scientific WGS84 działa — ładowanie prawdziwego obrazu Ziemi…' : 'Legacy sphere działa — ładowanie prawdziwego obrazu Ziemi…')

      const animate = () => {
        frame = requestAnimationFrame(animate)
        controls?.update()
        clouds.rotation.y += 0.00018
        grid.rotation.copy(earth.rotation)
        terminator.rotation.y = earth.rotation.y + Math.PI / 2
        renderer?.render(scene, camera)
      }
      animate()

      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        window.removeEventListener('resize', resize)
        controls?.dispose()
        scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            const material = object.material
            if (Array.isArray(material)) material.forEach(item => item.dispose())
            else {
              for (const value of Object.values(material)) {
                if (value instanceof THREE.Texture) value.dispose()
              }
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
  }, [model, markers, autoRotate, textureUrl, showClouds, showGrid, showAtmosphere, showTerminator])

  const selectModel = (next: EarthModel) => {
    setModel(next)
    try { writeEarthModel(next) } catch { /* localStorage can be blocked */ }
  }

  return <section className="earth-viewer-stack" aria-label="Główny model Ziemi 3D">
    <div className="earth-model-switch" role="group" aria-label="Wybór modelu Ziemi">
      <button type="button" className={model === 'scientific' ? 'is-active' : ''} onClick={() => selectModel('scientific')}>Scientific WGS84</button>
      <button type="button" className={model === 'legacy' ? 'is-active' : ''} onClick={() => selectModel('legacy')}>Legacy sphere</button>
    </div>
    <div className="earth-layer-switch" role="group" aria-label="Warstwy modelu Ziemi">
      <button type="button" className={showClouds ? 'is-active' : ''} onClick={() => setShowClouds(value => !value)}>Chmury</button>
      <button type="button" className={showAtmosphere ? 'is-active' : ''} onClick={() => setShowAtmosphere(value => !value)}>Atmosfera</button>
      <button type="button" className={showGrid ? 'is-active' : ''} onClick={() => setShowGrid(value => !value)}>Siatka</button>
      <button type="button" className={showTerminator ? 'is-active' : ''} onClick={() => setShowTerminator(value => !value)}>Dzień / noc</button>
    </div>
    <p className="earth-model-explainer"><strong>{status}</strong><br/>Obraz powierzchni i chmur jest nakładany na model 3D. Obracaj palcem lub myszą; przybliżaj gestem albo kółkiem.</p>
    <div className="stable-earth-shell">
      <div className="stable-earth-head"><strong>{model === 'scientific' ? 'Ziemia — elipsoida WGS84' : 'Ziemia — kula porównawcza'}</strong><span>{new Date(selectedTime).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span></div>
      <div ref={host} className="stable-earth-canvas" />
      <p className="muted earth-imagery-credit">Warstwa bazowa: publiczna globalna mozaika Ziemi używana w przykładach Three.js. Widok jest mozaiką mapową, a nie pojedynczym zdjęciem całej planety wykonanym w jednej chwili.</p>
    </div>
  </section>
}
