import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { EarthModel } from './lib/earthPreferences'
import { createWgs84EllipsoidScale, latLonToCartesian } from './lib/wgs84'
import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[]; autoRotate?: boolean; model?: EarthModel }

const EARTH_TEXTURE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74393/world.topo.bathy.200412.3x5400x2700.jpg'
const EARTH_RADIUS = 2

export function StableEarthGlobe({ selectedTime, markers = [], autoRotate = true, model = 'scientific' }: Props) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0.35, 6.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    element.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 2.35
    controls.maxDistance = 14
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 0.35

    const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x1e6fa8, roughness: 0.92, metalness: 0 })
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 96, 96), earthMaterial)
    const earthScale = model === 'scientific' ? createWgs84EllipsoidScale(1) : new THREE.Vector3(1, 1, 1)
    earth.scale.copy(earthScale)
    earth.rotation.y = -0.35
    scene.add(earth)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.028, 96, 96),
      new THREE.MeshBasicMaterial({ color: 0x56b9ff, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    )
    atmosphere.scale.copy(earthScale)
    scene.add(atmosphere)

    scene.add(new THREE.AmbientLight(0x8fcfff, 1.15))
    const sun = new THREE.DirectionalLight(0xffffff, 2.25)
    sun.position.set(5, 3, 5)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0x4b9dff, 0.85)
    rim.position.set(-5, -1, -4)
    scene.add(rim)

    for (const marker of markers.slice(0, 500)) {
      const point = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.025, (marker.radius ?? 1) * 0.025), 12, 12),
        new THREE.MeshBasicMaterial({ color: marker.color ?? 0xff674f }),
      )
      point.position.copy(latLonToCartesian(
        marker.latitude,
        marker.longitude,
        model === 'scientific'
          ? { kind: 'wgs84', scale: (EARTH_RADIUS * 1.0125) / 6_378_137 }
          : { kind: 'sphere', radius: EARTH_RADIUS * 1.0125 },
      ))
      earth.add(point)
    }

    const textureLoader = new THREE.TextureLoader()
    textureLoader.setCrossOrigin('anonymous')
    textureLoader.load(
      EARTH_TEXTURE,
      texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        earthMaterial.map = texture
        earthMaterial.color.set(0xffffff)
        earthMaterial.needsUpdate = true
      },
      undefined,
      () => {
        // The blue material remains visible when the external NASA image is unavailable.
      },
    )

    let animationFrame = 0
    const resize = () => {
      const width = Math.max(1, element.clientWidth)
      const height = Math.max(420, element.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    const render = () => {
      animationFrame = requestAnimationFrame(render)
      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      controls.dispose()
      earth.geometry.dispose()
      earthMaterial.map?.dispose()
      earthMaterial.dispose()
      atmosphere.geometry.dispose()
      ;(atmosphere.material as THREE.Material).dispose()
      renderer.dispose()
      element.replaceChildren()
    }
  }, [markers, autoRotate, model])

  return (
    <section className="stable-earth-shell" aria-label="Stabilny model Ziemi 3D">
      <div className="stable-earth-head">
        <strong>{model === 'scientific' ? 'Scientific Earth — elipsoida WGS84' : 'Legacy Earth — model kulisty'}</strong>
        <span>{new Date(selectedTime).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</span>
        <small>Obracaj palcem lub myszką. Kółkiem i gestem szczypania zmienisz odległość.</small>
      </div>
      <div ref={host} className="stable-earth-canvas" />
    </section>
  )
}
