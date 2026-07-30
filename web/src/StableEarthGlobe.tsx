import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { EarthModel } from './lib/earthPreferences'
import { createWgs84EllipsoidScale, latLonToCartesian } from './lib/wgs84'
import './stable-earth-globe.css'

type Marker = { longitude: number; latitude: number; color?: number; radius?: number }
type Props = { selectedTime: string; markers?: Marker[]; autoRotate?: boolean; model?: EarthModel }

const EARTH_RADIUS = 2

function createFallbackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  const ocean = context.createLinearGradient(0, 0, 0, canvas.height)
  ocean.addColorStop(0, '#174f86')
  ocean.addColorStop(0.5, '#0d6c9c')
  ocean.addColorStop(1, '#082d57')
  context.fillStyle = ocean
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = '#4f8e52'
  context.beginPath()
  context.ellipse(520, 235, 95, 150, -0.3, 0, Math.PI * 2)
  context.ellipse(430, 165, 145, 80, 0.2, 0, Math.PI * 2)
  context.ellipse(700, 170, 175, 72, -0.1, 0, Math.PI * 2)
  context.ellipse(785, 325, 75, 48, 0.2, 0, Math.PI * 2)
  context.ellipse(245, 190, 120, 95, -0.25, 0, Math.PI * 2)
  context.ellipse(300, 330, 70, 120, 0.15, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = 'rgba(255,255,255,.18)'
  context.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += canvas.width / 12) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke()
  }
  for (let y = 0; y <= canvas.height; y += canvas.height / 6) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

export function StableEarthGlobe({ selectedTime, markers = [], autoRotate = true, model = 'scientific' }: Props) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      element.textContent = 'WebGL nie jest dostępny na tym urządzeniu.'
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0.35, 6.2)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    element.replaceChildren(renderer.domElement)

    const earthScale = model === 'scientific' ? createWgs84EllipsoidScale(1) : new THREE.Vector3(1, 1, 1)
    const earthMaterial = new THREE.MeshStandardMaterial({ map: createFallbackTexture(), roughness: 0.9, metalness: 0 })
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 72, 72), earthMaterial)
    earth.scale.copy(earthScale)
    earth.rotation.set(0.08, -0.35, -0.08)
    scene.add(earth)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.035, 72, 72),
      new THREE.MeshBasicMaterial({ color: 0x63bfff, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    )
    atmosphere.scale.copy(earthScale)
    scene.add(atmosphere)

    scene.add(new THREE.HemisphereLight(0xbfe7ff, 0x07111f, 1.8))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(5, 3, 5)
    scene.add(sun)

    for (const marker of markers.slice(0, 500)) {
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
          ? { kind: 'wgs84', scale: (EARTH_RADIUS * 1.015) / 6_378_137 }
          : { kind: 'sphere', radius: EARTH_RADIUS * 1.015 },
      ))
      earth.add(point)
    }

    let distance = 6.2
    let dragging = false
    let pointerX = 0
    let pointerY = 0
    const onPointerDown = (event: PointerEvent) => { dragging = true; pointerX = event.clientX; pointerY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId) }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      earth.rotation.y += (event.clientX - pointerX) * 0.006
      earth.rotation.x += (event.clientY - pointerY) * 0.004
      atmosphere.rotation.copy(earth.rotation)
      pointerX = event.clientX; pointerY = event.clientY
    }
    const onPointerUp = () => { dragging = false }
    const onWheel = (event: WheelEvent) => { event.preventDefault(); distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.004, 2.6, 14); camera.position.z = distance }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    const resize = () => {
      const width = Math.max(1, element.clientWidth)
      const height = Math.max(420, element.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(element)
    window.addEventListener('resize', resize)
    resize()

    let animationFrame = 0
    const render = () => {
      animationFrame = requestAnimationFrame(render)
      if (autoRotate && !dragging) {
        earth.rotation.y += 0.0012
        atmosphere.rotation.y += 0.0012
      }
      renderer.render(scene, camera)
    }
    render()

    return () => {
      cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      earth.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material
          if (Array.isArray(material)) material.forEach(item => item.dispose())
          else material.dispose()
        }
      })
      earthMaterial.map?.dispose()
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
        <small>Model działa bez zewnętrznych skryptów i obrazów. Obracaj palcem lub myszką; kółkiem zmienisz odległość.</small>
      </div>
      <div ref={host} className="stable-earth-canvas" />
    </section>
  )
}
