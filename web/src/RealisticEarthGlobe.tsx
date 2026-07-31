import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthSourcePanel } from './EarthSourcePanel'
import { readEarthModel, writeEarthModel, type EarthModel } from './lib/earthPreferences'
import { loadEarthTexture } from './lib/earthTextureManagement'
import { EARTH_VIEW_PRESETS, type EarthViewPreset } from './lib/earthViewPresets'
import { latLonToCartesian } from './lib/wgs84'
import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { textureUrl?: string; selectedTime: string; markers?: Marker[]; autoRotate?: boolean }
type CameraState = { position: THREE.Vector3; target: THREE.Vector3 }
type RuntimeCamera = { camera: THREE.PerspectiveCamera; controls: OrbitControls }

const EARTH_RADIUS = 2
const POLAR_RATIO = 6_356_752.314245 / 6_378_137
const CAMERA_DISTANCE_MIN = 4.8
const CAMERA_DISTANCE_MAX = 8.2

function presetDistance(heightM: number): number {
  const normalized = THREE.MathUtils.clamp(
    (heightM - 12_000_000) / 9_000_000,
    0,
    1,
  )
  return THREE.MathUtils.lerp(CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX, normalized)
}

export function RealisticEarthGlobe({
  textureUrl,
  selectedTime,
  markers = [],
  autoRotate = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const runtimeCamera = useRef<RuntimeCamera | null>(null)
  const cameraState = useRef<CameraState>({
    position: new THREE.Vector3(0, 0.35, 6.4),
    target: new THREE.Vector3(0, 0, 0),
  })
  const [model, setModel] = useState<EarthModel>('scientific')
  const [status, setStatus] = useState('Uruchamianie modelu 3D…')

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
    let surfaceTexture: THREE.Texture | null = null
    let active = true

    try {
      element.replaceChildren()
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' })
      renderer.setClearColor(0x020914, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      element.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
      camera.position.copy(cameraState.current.position)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.copy(cameraState.current.target)
      controls.enableDamping = true
      controls.enablePan = false
      controls.minDistance = 2.8
      controls.maxDistance = 14
      controls.autoRotate = autoRotate
      controls.autoRotateSpeed = 0.35
      controls.update()
      runtimeCamera.current = { camera, controls }

      const earthMaterial = new THREE.MeshStandardMaterial({
        color: 0x176aa0,
        roughness: 0.82,
        metalness: 0,
      })
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS, 64, 48),
        earthMaterial,
      )
      if (model === 'scientific') earth.scale.y = POLAR_RATIO
      scene.add(earth)

      void loadEarthTexture(textureUrl, import.meta.env.BASE_URL).then(result => {
        if (!active) {
          result.texture?.dispose()
          return
        }
        if (result.texture) {
          surfaceTexture = result.texture
          earthMaterial.map = result.texture
          earthMaterial.color.set(0xffffff)
          earthMaterial.needsUpdate = true
          setStatus(model === 'scientific'
            ? 'Naukowy globus działa z teksturą powierzchni'
            : 'Dotychczasowy model działa z teksturą powierzchni')
          return
        }
        setStatus(result.error
          ? `Tekstura niedostępna — użyto bezpiecznego modelu zastępczego: ${result.error}`
          : model === 'scientific' ? 'Naukowy globus działa' : 'Dotychczasowy model działa')
      })

      const grid = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 24, 12),
        new THREE.MeshBasicMaterial({ color: 0x62d7ff, wireframe: true, transparent: true, opacity: 0.14 }),
      )
      grid.scale.copy(earth.scale)
      scene.add(grid)

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.04, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0x54bfff, transparent: true, opacity: 0.13, side: THREE.BackSide }),
      )
      atmosphere.scale.copy(earth.scale)
      scene.add(atmosphere)

      scene.add(new THREE.HemisphereLight(0xbfe7ff, 0x07111f, 1.7))
      const light = new THREE.DirectionalLight(0xffffff, 2.1)
      light.position.set(5, 4, 5)
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
      setStatus(model === 'scientific' ? 'Naukowy globus działa' : 'Dotychczasowy model działa')

      const animate = () => {
        frame = requestAnimationFrame(animate)
        controls?.update()
        renderer?.render(scene, camera)
      }
      animate()

      return () => {
        active = false
        cameraState.current.position.copy(camera.position)
        cameraState.current.target.copy(controls?.target ?? new THREE.Vector3())
        runtimeCamera.current = null
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        window.removeEventListener('resize', resize)
        controls?.dispose()
        surfaceTexture?.dispose()
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
      active = false
      runtimeCamera.current = null
      setStatus(`Błąd renderera 3D: ${error instanceof Error ? error.message : String(error)}`)
      element.innerHTML = '<div class="earth-render-error">Nie udało się uruchomić WebGL. Spróbuj odświeżyć kartę lub zamknąć inne aplikacje.</div>'
      return () => {
        cancelAnimationFrame(frame)
        resizeObserver?.disconnect()
        controls?.dispose()
        surfaceTexture?.dispose()
        renderer?.dispose()
      }
    }
  }, [model, markers, autoRotate, textureUrl])

  const selectModel = (next: EarthModel) => {
    setModel(next)
    try { writeEarthModel(next) } catch { /* localStorage can be blocked */ }
  }

  const selectPreset = (preset: EarthViewPreset) => {
    const runtime = runtimeCamera.current
    if (!runtime) return
    const direction = latLonToCartesian(
      preset.latitude,
      preset.longitude,
      { kind: 'sphere', radius: 1 },
    ).normalize()
    const nextPosition = direction.multiplyScalar(presetDistance(preset.heightM))
    runtime.camera.position.copy(nextPosition)
    runtime.controls.target.set(0, 0, 0)
    runtime.controls.update()
    cameraState.current.position.copy(nextPosition)
    cameraState.current.target.set(0, 0, 0)
  }

  return <section className="earth-viewer-stack" aria-label="Główny model Ziemi 3D">
    <div className="earth-model-switch" role="group" aria-label="Model Ziemi">
      <button
        type="button"
        aria-pressed={model === 'legacy'}
        className={model === 'legacy' ? 'is-active' : ''}
        onClick={() => selectModel('legacy')}
      >Dotychczasowy model</button>
      <button
        type="button"
        aria-pressed={model === 'scientific'}
        className={model === 'scientific' ? 'is-active' : ''}
        onClick={() => selectModel('scientific')}
      >Naukowy globus — rzeczywiste proporcje</button>
    </div>
    <div className="earth-camera-presets" role="group" aria-label="Szybkie widoki Ziemi">
      {EARTH_VIEW_PRESETS.map(preset => (
        <button
          key={preset.id}
          type="button"
          title={preset.description}
          onClick={() => selectPreset(preset)}
        >
          {preset.label}
        </button>
      ))}
    </div>
    <p className="earth-model-explainer">
      <strong>{status}</strong><br/>
      Model naukowy pokazuje kontynenty na globusie bez zniekształceń powierzchni płaskiej projekcji Mercatora.
      Przełączenie modelu zachowuje pozycję kamery, wybrany czas i markery.
    </p>
    <EarthSourcePanel />
    <div className="stable-earth-shell">
      <div className="stable-earth-head">
        <strong>{model === 'scientific' ? 'Ziemia — elipsoida WGS84' : 'Ziemia — klasyczna kula 3D'}</strong>
        <span>{new Date(selectedTime).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span>
      </div>
      <div ref={host} className="stable-earth-canvas" />
    </div>
  </section>
}
