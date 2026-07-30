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

export function RealisticEarthGlobe({ selectedTime, markers = [], autoRotate = true }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [model, setModel] = useState<EarthModel>('scientific')
  const [status, setStatus] = useState('Uruchamianie modelu 3D…')

  useEffect(() => { setModel(readEarthModel()) }, [])

  useEffect(() => {
    const element = host.current
    if (!element) return
    element.replaceChildren()

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setStatus('WebGL nie jest dostępny na tym urządzeniu.')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
    camera.position.set(5.5, 3.8, 7)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 2.8
    controls.maxDistance = 16
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 0.45

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x176aa0, roughness: 0.78, metalness: 0.02 }),
    )
    if (model === 'scientific') earth.scale.y = POLAR_RATIO
    earth.rotation.set(0.08, -0.35, -0.08)
    scene.add(earth)

    const grid = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.003, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x62d7ff, wireframe: true, transparent: true, opacity: 0.12 }),
    )
    grid.scale.copy(earth.scale)
    grid.rotation.copy(earth.rotation)
    scene.add(grid)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.04, 40, 40),
      new THREE.MeshBasicMaterial({ color: 0x54bfff, transparent: true, opacity: 0.11, side: THREE.BackSide }),
    )
    atmosphere.scale.copy(earth.scale)
    scene.add(atmosphere)

    scene.add(new THREE.AmbientLight(0x9dcfff, 1.6))
    const light = new THREE.DirectionalLight(0xffffff, 2.2)
    light.position.set(5, 5, 5)
    scene.add(light)

    for (const marker of markers.slice(0, 250)) {
      if (!Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude)) continue
      if (marker.latitude < -90 || marker.latitude > 90 || marker.longitude < -180 || marker.longitude > 180) continue
      const point = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.025, (marker.radius ?? 1) * 0.025), 10, 10),
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

    let frame = 0
    const resize = () => {
      const width = Math.max(1, element.clientWidth)
      const height = Math.max(440, element.clientHeight || 440)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    setStatus(model === 'scientific' ? 'Scientific WGS84 działa' : 'Legacy sphere działa')

    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      grid.rotation.copy(earth.rotation)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material
          if (Array.isArray(material)) material.forEach(item => item.dispose())
          else material.dispose()
        }
      })
      renderer.dispose()
      element.replaceChildren()
    }
  }, [model, markers, autoRotate])

  const selectModel = (next: EarthModel) => {
    setModel(next)
    writeEarthModel(next)
  }

  return <section className="earth-viewer-stack" aria-label="Główny model Ziemi 3D">
    <div className="earth-model-switch" role="group" aria-label="Wybór modelu Ziemi">
      <button type="button" className={model === 'scientific' ? 'is-active' : ''} onClick={() => selectModel('scientific')}>Scientific WGS84</button>
      <button type="button" className={model === 'legacy' ? 'is-active' : ''} onClick={() => selectModel('legacy')}>Legacy sphere</button>
    </div>
    <p className="earth-model-explainer"><strong>{status}</strong><br/>Ten renderer używa tego samego prostego i sprawdzonego mechanizmu Three.js co działające obserwatoria biegunowe. Obracaj palcem, przybliżaj gestem szczypania.</p>
    <div className="stable-earth-shell">
      <div className="stable-earth-head"><strong>{model === 'scientific' ? 'Ziemia — elipsoida WGS84' : 'Ziemia — kula porównawcza'}</strong><span>{new Date(selectedTime).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span></div>
      <div ref={host} className="stable-earth-canvas" />
    </div>
  </section>
}
