import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type Marker = {
  longitude: number
  latitude: number
  color?: number
  radius?: number
}

type Props = {
  textureUrl?: string
  selectedTime: string
  markers?: Marker[]
  autoRotate?: boolean
}

const DEFAULT_TEXTURE =
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?' +
  new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE',
    LAYERS: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    CRS: 'EPSG:4326',
    STYLES: '',
    WIDTH: '2048',
    HEIGHT: '1024',
    BBOX: '-90,-180,90,180',
    TIME: new Date(Date.now() - 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  }).toString()

function pointOnSphere(longitude: number, latitude: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - latitude)
  const theta = THREE.MathUtils.degToRad(longitude + 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function sunDirection(timestamp: string) {
  const date = new Date(timestamp)
  const day =
    (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000
  const declination = THREE.MathUtils.degToRad(
    -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365.25),
  )
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const longitude = THREE.MathUtils.degToRad((12 - utcHours) * 15)
  return new THREE.Vector3(
    Math.cos(declination) * Math.cos(longitude),
    Math.sin(declination),
    Math.cos(declination) * Math.sin(longitude),
  ).normalize()
}

export function RealisticEarthGlobe({
  textureUrl,
  selectedTime,
  markers = [],
  autoRotate = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0, 7.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    element.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.minDistance = 3.8
    controls.maxDistance = 14
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 0.35

    const earthGroup = new THREE.Group()
    earthGroup.rotation.z = THREE.MathUtils.degToRad(-23.44)
    scene.add(earthGroup)

    const textureLoader = new THREE.TextureLoader()
    textureLoader.setCrossOrigin('anonymous')
    const earthTexture = textureLoader.load(textureUrl || DEFAULT_TEXTURE)
    earthTexture.colorSpace = THREE.SRGBColorSpace
    earthTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)

    const earthGeometry = new THREE.SphereGeometry(2.55, 128, 96)
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.92,
      metalness: 0,
    })
    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    earthGroup.add(earth)

    const atmosphereGeometry = new THREE.SphereGeometry(2.62, 96, 72)
    const atmosphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x78c8ff,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    earthGroup.add(atmosphere)

    const markerGeometry = new THREE.SphereGeometry(0.045, 12, 12)
    const markerMaterials: THREE.MeshBasicMaterial[] = []
    for (const marker of markers.slice(0, 1000)) {
      const material = new THREE.MeshBasicMaterial({
        color: marker.color ?? 0xff674f,
      })
      markerMaterials.push(material)
      const mesh = new THREE.Mesh(markerGeometry, material)
      const position = pointOnSphere(marker.longitude, marker.latitude, 2.59)
      mesh.position.copy(position)
      const scale = marker.radius ?? 1
      mesh.scale.setScalar(scale)
      earthGroup.add(mesh)
    }

    scene.add(new THREE.AmbientLight(0x7da5c7, 0.38))
    const sun = new THREE.DirectionalLight(0xffffff, 3.1)
    sun.position.copy(sunDirection(selectedTime).multiplyScalar(8))
    scene.add(sun)

    const rim = new THREE.DirectionalLight(0x4ca6ff, 0.42)
    rim.position.set(-5, 2, -5)
    scene.add(rim)

    const resize = () => {
      const width = Math.max(element.clientWidth, 1)
      const height = Math.max(element.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    let animationFrame = 0
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      controls.dispose()
      earthTexture.dispose()
      earthGeometry.dispose()
      earthMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      markerGeometry.dispose()
      markerMaterials.forEach(material => material.dispose())
      renderer.dispose()
      element.replaceChildren()
    }
  }, [autoRotate, markers, selectedTime, textureUrl])

  return (
    <div
      className="globe-canvas realistic-earth-globe"
      ref={host}
      aria-label="Realistyczny glob 3D z najnowszą dostępną teksturą satelitarną"
    />
  )
}
