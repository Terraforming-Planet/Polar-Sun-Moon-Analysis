import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './location-globe.css'

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
  heading: number | null
  timestamp: number
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

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Dostęp do lokalizacji został odrzucony.'
  if (error.code === error.POSITION_UNAVAILABLE) return 'Pozycja jest obecnie niedostępna.'
  if (error.code === error.TIMEOUT) return 'Upłynął czas oczekiwania na pozycję GPS.'
  return 'Nie udało się odczytać lokalizacji.'
}

export function RealisticEarthGlobe({
  textureUrl,
  selectedTime,
  markers = [],
  autoRotate = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const userMarkerRef = useRef<THREE.Mesh | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

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
          heading: position.coords.heading,
          timestamp: position.timestamp,
        })
        setLocationError(null)
      },
      error => {
        setLocationError(geolocationErrorMessage(error))
        setLocating(false)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1_000,
        timeout: 15_000,
      },
    )
  }

  const focusUser = () => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || !userLocation) return
    const direction = pointOnSphere(userLocation.longitude, userLocation.latitude, 1).normalize()
    camera.position.copy(direction.multiplyScalar(4.25))
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.autoRotate = false
    controls.update()
  }

  useEffect(() => () => stopTracking(), [])

  useEffect(() => {
    const marker = userMarkerRef.current
    if (!marker || !userLocation) return
    marker.position.copy(pointOnSphere(userLocation.longitude, userLocation.latitude, 2.63))
    marker.visible = true
  }, [userLocation])

  useEffect(() => {
    const element = host.current
    if (!element) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0, 7.4)
    cameraRef.current = camera

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
    controlsRef.current = controls

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
    earthGroup.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

    const markerGeometry = new THREE.SphereGeometry(0.045, 12, 12)
    const markerMaterials: THREE.MeshBasicMaterial[] = []
    for (const marker of markers.slice(0, 1000)) {
      const material = new THREE.MeshBasicMaterial({ color: marker.color ?? 0xff674f })
      markerMaterials.push(material)
      const mesh = new THREE.Mesh(markerGeometry, material)
      mesh.position.copy(pointOnSphere(marker.longitude, marker.latitude, 2.59))
      mesh.scale.setScalar(marker.radius ?? 1)
      earthGroup.add(mesh)
    }

    const userMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x74ffb8 })
    const userMarker = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 18), userMarkerMaterial)
    userMarker.visible = false
    earthGroup.add(userMarker)
    userMarkerRef.current = userMarker

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
      userMarker.geometry.dispose()
      userMarkerMaterial.dispose()
      renderer.dispose()
      cameraRef.current = null
      controlsRef.current = null
      userMarkerRef.current = null
      element.replaceChildren()
    }
  }, [autoRotate, markers, selectedTime, textureUrl])

  return (
    <div className="location-globe-shell">
      <div className="location-globe-toolbar">
        <button type="button" onClick={locating ? stopTracking : startTracking}>
          {locating ? 'Zatrzymaj lokalizację' : 'Znajdź mnie'}
        </button>
        <button type="button" onClick={focusUser} disabled={!userLocation}>
          Przybliż do mojej pozycji
        </button>
        {(userLocation || locationError) && (
          <div className="location-globe-status" role="status" aria-live="polite">
            {userLocation && (
              <>
                <strong>Pozycja urządzenia aktualizowana na żywo</strong>
                <span>{userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}</span>
                <span>Dokładność GPS: ±{Math.round(userLocation.accuracy)} m</span>
                <span>Aktualizacja: {new Date(userLocation.timestamp).toLocaleTimeString('pl-PL')}</span>
              </>
            )}
            {locationError && <span className="location-globe-error">{locationError}</span>}
          </div>
        )}
      </div>
      <div
        className="globe-canvas realistic-earth-globe"
        ref={host}
        aria-label="Realistyczny glob 3D z najnowszą dostępną teksturą satelitarną i lokalizacją urządzenia"
      />
    </div>
  )
}
