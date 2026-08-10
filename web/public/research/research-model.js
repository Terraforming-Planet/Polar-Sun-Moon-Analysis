import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js'
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/OrbitControls.js'

const bodyColors = {
  Sun: 0xffd15c, Mercury: 0xa9a9a9, Venus: 0xdba66b, Earth: 0x3f83ff,
  Moon: 0xd6d9df, Mars: 0xd76543, Jupiter: 0xd7a472, Saturn: 0xe3cf8f,
  Uranus: 0x83d8e5, Neptune: 0x315dce,
}

function scaledPosition(position, trueScale) {
  const vector = new THREE.Vector3(...position)
  const distance = vector.length()
  if (!distance) return vector
  const radius = trueScale ? distance * 16 : Math.log10(1 + distance * 120) * 13
  return vector.normalize().multiplyScalar(radius)
}

function buildSolarSystem(host, data, { speed = 1, trueScale = false, controlsPrefix = '' } = {}) {
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x030711, 0.006)

  const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1000)
  camera.position.set(0, 34, 64)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.replaceChildren(renderer.domElement)

  const orbitControls = new OrbitControls(camera, renderer.domElement)
  orbitControls.enableDamping = true
  orbitControls.minDistance = 5
  orbitControls.maxDistance = 180

  scene.add(new THREE.AmbientLight(0x7897c5, 1.4))
  const sunLight = new THREE.PointLight(0xffe1a1, 1800, 250)
  scene.add(sunLight)

  const stars = new THREE.BufferGeometry()
  const starPoints = []
  for (let index = 0; index < 1700; index += 1) {
    const radius = 180 + Math.random() * 180
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    starPoints.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    )
  }
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPoints, 3))
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xb9d4ff, size: 0.34 })))

  const movingBodies = []
  data.bodies.forEach((body, bodyIndex) => {
    const position = scaledPosition(body.position_au, trueScale)
    const isSun = body.body === 'Sun'
    const isMoon = body.body === 'Moon'
    const size = isSun ? 2.5 : isMoon ? 0.34 : body.body === 'Jupiter' ? 1.15 : body.body === 'Saturn' ? 1.0 : 0.62
    const material = new THREE.MeshStandardMaterial({
      color: bodyColors[body.body] ?? 0xffffff,
      emissive: isSun ? 0xff9d26 : 0x000000,
      emissiveIntensity: isSun ? 2.2 : 0,
      roughness: 0.78,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 32), material)
    mesh.position.copy(position)
    scene.add(mesh)

    if (!isSun && position.length() > 1) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(position.length() - 0.025, position.length() + 0.025, 180),
        new THREE.MeshBasicMaterial({ color: 0x29476f, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
      )
      ring.rotation.x = Math.PI / 2
      scene.add(ring)
      movingBodies.push({ mesh, radius: position.length(), phase: Math.atan2(position.z, position.x), rate: 0.00009 * (11 - Math.min(bodyIndex, 9)) })
    }

    if (body.body === 'Saturn') {
      const rings = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 2.0, 64),
        new THREE.MeshBasicMaterial({ color: 0xbcae7d, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }),
      )
      rings.position.copy(position)
      rings.rotation.x = 1.2
      scene.add(rings)
      movingBodies[movingBodies.length - 1].rings = rings
    }
  })

  let frame = 0
  let running = false
  let last = performance.now()
  const play = document.getElementById(`${controlsPrefix}play`)
  const stop = document.getElementById(`${controlsPrefix}stop`)
  const status = document.getElementById(`${controlsPrefix}status`)

  const setRunning = value => {
    running = value
    if (status) status.textContent = running ? `PLAY · ${speed}×` : 'STOP'
    play?.classList.toggle('active', running)
    stop?.classList.toggle('active', !running)
  }
  play?.addEventListener('click', () => setRunning(true))
  stop?.addEventListener('click', () => setRunning(false))

  const resize = () => {
    const { clientWidth, clientHeight } = host
    renderer.setSize(clientWidth, clientHeight, false)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
  }

  const animate = now => {
    frame = requestAnimationFrame(animate)
    const delta = Math.min(now - last, 50)
    last = now
    if (running) {
      movingBodies.forEach(body => {
        body.phase += body.rate * delta * speed
        body.mesh.position.set(Math.cos(body.phase) * body.radius, body.mesh.position.y, Math.sin(body.phase) * body.radius)
        body.mesh.rotation.y += 0.0015 * delta * speed
        if (body.rings) body.rings.position.copy(body.mesh.position)
      })
    }
    orbitControls.update()
    renderer.render(scene, camera)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  setRunning(false)
  animate(performance.now())

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    orbitControls.dispose()
    renderer.dispose()
  }
}

async function start() {
  const response = await fetch('../data/solar-system.json', { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) throw new Error('Nie można pobrać danych solar-system.json')
  const data = await response.json()
  document.querySelectorAll('[data-epoch]').forEach(node => { node.textContent = data.timestamp_utc || 'brak danych' })
  buildSolarSystem(document.getElementById('solar-standard'), data, { speed: 1, controlsPrefix: 'std-' })
  buildSolarSystem(document.getElementById('solar-fast'), data, { speed: 30, controlsPrefix: 'fast-' })
}

start().catch(error => {
  document.querySelectorAll('.model-canvas').forEach(host => {
    host.innerHTML = `<div class="model-error">Model 3D nie został uruchomiony: ${String(error.message || error)}</div>`
  })
})
