import * as THREE from 'https://esm.sh/three@0.179.1'
import { OrbitControls } from 'https://esm.sh/three@0.179.1/examples/jsm/controls/OrbitControls.js'

const COLORS = { Sun: 0xffc94f, Earth: 0x2f82ff, Moon: 0xd9dde5 }

function scaledPosition(position) {
  const vector = new THREE.Vector3(...position)
  const distance = vector.length()
  if (!distance) return vector
  const radius = Math.log10(1 + distance * 120) * 13
  return vector.normalize().multiplyScalar(radius)
}

function makeStars(scene) {
  const geometry = new THREE.BufferGeometry()
  const points = []
  for (let i = 0; i < 1700; i += 1) {
    const radius = 150 + Math.random() * 180
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    points.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    )
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xb9d4ff, size: 0.34 })))
}

function addOrbit(scene, radius, color = 0x29476f) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.01, radius - 0.025), radius + 0.025, 180),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  )
  ring.rotation.x = Math.PI / 2
  scene.add(ring)
  return ring
}

function addLabel(scene, text, position, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '700 28px Arial'
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.fillText(text, 128, 40)
  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.position.copy(position)
  sprite.position.y += 1.8
  sprite.scale.set(6, 1.5, 1)
  scene.add(sprite)
  return sprite
}

function buildSunEarthMoon(host, data, { speed = 1, prefix = '' } = {}) {
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x030711, 0.006)
  const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 1000)
  camera.position.set(0, 26, 58)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.replaceChildren(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 6
  controls.maxDistance = 160

  scene.add(new THREE.AmbientLight(0x7897c5, 1.3))
  const sunLight = new THREE.PointLight(0xffe1a1, 2200, 260)
  scene.add(sunLight)
  makeStars(scene)

  const sunData = data.bodies.find(body => body.body === 'Sun')
  const earthData = data.bodies.find(body => body.body === 'Earth')
  const moonData = data.bodies.find(body => body.body === 'Moon')
  if (!sunData || !earthData || !moonData) throw new Error('Brakuje Sun/Earth/Moon w solar-system.json')

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(2.7, 48, 48),
    new THREE.MeshStandardMaterial({ color: COLORS.Sun, emissive: 0xff8b1f, emissiveIntensity: 2.5, roughness: 0.7 }),
  )
  scene.add(sun)
  addLabel(scene, 'SUN', new THREE.Vector3(0, 0, 0), '#ffd76a')

  const earthStart = scaledPosition(earthData.position_au)
  const earthRadius = earthStart.length()
  addOrbit(scene, earthRadius)
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 48, 48),
    new THREE.MeshStandardMaterial({ color: COLORS.Earth, roughness: 0.76, metalness: 0.02 }),
  )
  earth.position.copy(earthStart)
  scene.add(earth)
  const earthLabel = addLabel(scene, 'EARTH', earth.position, '#69c8ff')

  const moonVisualRadius = 3.0
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 32, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.Moon, roughness: 0.92 }),
  )
  const moonDelta = new THREE.Vector3(...moonData.position_au).sub(new THREE.Vector3(...earthData.position_au))
  const moonPhase0 = Math.atan2(moonDelta.z, moonDelta.x)
  moon.position.set(
    earth.position.x + Math.cos(moonPhase0) * moonVisualRadius,
    earth.position.y + 0.35,
    earth.position.z + Math.sin(moonPhase0) * moonVisualRadius,
  )
  scene.add(moon)
  const moonLabel = addLabel(scene, 'MOON', moon.position, '#e7ecf5')

  const moonOrbit = new THREE.Mesh(
    new THREE.RingGeometry(moonVisualRadius - 0.025, moonVisualRadius + 0.025, 120),
    new THREE.MeshBasicMaterial({ color: 0x7f9fc4, transparent: true, opacity: 0.52, side: THREE.DoubleSide }),
  )
  moonOrbit.rotation.x = Math.PI / 2
  moonOrbit.position.copy(earth.position)
  scene.add(moonOrbit)

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), earth.position.clone()])
  const sunEarthLine = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x41617d, transparent: true, opacity: 0.55 }))
  scene.add(sunEarthLine)

  let running = false
  let frame = 0
  let last = performance.now()
  let earthPhase = Math.atan2(earth.position.z, earth.position.x)
  let moonPhase = moonPhase0
  const play = document.getElementById(`${prefix}play`)
  const stop = document.getElementById(`${prefix}stop`)
  const status = document.getElementById(`${prefix}status`)

  const setRunning = value => {
    running = value
    if (status) status.textContent = running ? `PLAY · ${speed}×` : 'STOP'
    play?.classList.toggle('active', running)
    stop?.classList.toggle('active', !running)
  }
  play?.addEventListener('click', () => setRunning(true))
  stop?.addEventListener('click', () => setRunning(false))

  const resize = () => {
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const animate = now => {
    frame = requestAnimationFrame(animate)
    const delta = Math.min(now - last, 50)
    last = now
    if (running) {
      earthPhase += 0.000035 * delta * speed
      moonPhase += 0.00042 * delta * speed
      earth.position.set(Math.cos(earthPhase) * earthRadius, earthStart.y, Math.sin(earthPhase) * earthRadius)
      earth.rotation.y += 0.0018 * delta * speed
      moon.position.set(
        earth.position.x + Math.cos(moonPhase) * moonVisualRadius,
        earth.position.y + 0.35 * Math.sin(moonPhase * 0.7),
        earth.position.z + Math.sin(moonPhase) * moonVisualRadius,
      )
      moon.rotation.y += 0.00045 * delta * speed
      moonOrbit.position.copy(earth.position)
      earthLabel.position.copy(earth.position); earthLabel.position.y += 1.8
      moonLabel.position.copy(moon.position); moonLabel.position.y += 1.3
      sunEarthLine.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), earth.position.clone()])
    }
    controls.update()
    renderer.render(scene, camera)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  setRunning(false)
  animate(performance.now())
}

function cellAddress(index) {
  return `CELL-${String(index + 1).padStart(3, '0')}`
}

function decodeCell(index) {
  const z = Math.floor(index / 64)
  const rest = index % 64
  const y = Math.floor(rest / 8)
  const x = rest % 8
  return { x, y, z }
}

function buildPlanetaryGrid() {
  const stage = document.getElementById('cube-stage')
  const controls = document.getElementById('layer-controls')
  const list = document.getElementById('cell-list')
  const legend = document.getElementById('legend')
  if (!stage || !controls || !list || !legend) return

  const cells = []
  const layers = []
  let selectedIndex = 0
  let activeLayer = null

  const updateReadout = index => {
    selectedIndex = index
    const { x, y, z } = decodeCell(index)
    document.getElementById('cell-address').textContent = cellAddress(index)
    document.getElementById('cell-index').textContent = `index ${index} · X${x} Y${y} Z${z}`
    document.getElementById('coord-x').textContent = x
    document.getElementById('coord-y').textContent = y
    document.getElementById('coord-z').textContent = z
    cells.forEach((cell, i) => cell.classList.toggle('selected', i === index))
  }

  for (let z = 0; z < 8; z += 1) {
    const layer = document.createElement('div')
    layer.className = 'voxel-layer'
    layer.dataset.layer = String(z)
    layer.style.setProperty('--z', `${(z - 3.5) * 28}px`)
    layer.style.opacity = String(0.42 + z * 0.07)
    layers.push(layer)

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const index = z * 64 + y * 8 + x
        const button = document.createElement('button')
        button.className = 'voxel-cell'
        button.type = 'button'
        button.dataset.index = String(index)
        button.dataset.address = cellAddress(index)
        button.dataset.x = String(x)
        button.dataset.y = String(y)
        button.dataset.z = String(z)
        button.style.setProperty('--h', String((z * 45 + y * 7 + x * 3) % 360))
        button.title = `${cellAddress(index)} · X${x} Y${y} Z${z}`
        button.setAttribute('aria-label', button.title)
        button.addEventListener('click', () => updateReadout(index))
        layer.appendChild(button)
        cells.push(button)

        const row = document.createElement('button')
        row.type = 'button'
        row.innerHTML = `<b>${cellAddress(index)}</b><span>X${x} · Y${y} · Z${z}</span><span>#${index}</span>`
        row.addEventListener('click', () => {
          activeLayer = z
          applyLayerFilter()
          updateReadout(index)
          cells[index].scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
        list.appendChild(row)
      }
    }
    stage.appendChild(layer)

    const layerButton = document.createElement('button')
    layerButton.type = 'button'
    layerButton.className = 'layer-btn'
    layerButton.textContent = `Z${z}`
    layerButton.addEventListener('click', () => {
      activeLayer = activeLayer === z ? null : z
      applyLayerFilter()
    })
    controls.appendChild(layerButton)

    const swatch = document.createElement('div')
    swatch.style.background = `hsl(${z * 45} 78% 52%)`
    legend.appendChild(swatch)
  }

  function applyLayerFilter() {
    layers.forEach((layer, z) => {
      const active = activeLayer === null || z === activeLayer
      layer.style.opacity = active ? '0.9' : '0.08'
      layer.style.filter = active ? 'none' : 'grayscale(.6)'
    })
    ;[...controls.children].forEach((button, z) => button.classList.toggle('active', activeLayer === z))
  }

  updateReadout(selectedIndex)
  if (cells.length !== 512) throw new Error(`Grid integrity error: expected 512 cells, got ${cells.length}`)
}

async function start() {
  buildPlanetaryGrid()
  const response = await fetch('../data/solar-system.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`solar-system.json HTTP ${response.status}`)
  const data = await response.json()
  document.querySelectorAll('[data-epoch]').forEach(node => { node.textContent = data.timestamp_utc || 'brak danych' })
  buildSunEarthMoon(document.getElementById('solar-standard'), data, { speed: 1, prefix: 'std-' })
  buildSunEarthMoon(document.getElementById('solar-fast'), data, { speed: 30, prefix: 'fast-' })
}

start().catch(error => {
  console.error(error)
  document.querySelectorAll('.model-canvas').forEach(host => {
    if (!host.querySelector('canvas')) host.innerHTML = `<div class="model-error">Model 3D nie został uruchomiony: ${String(error.message || error)}</div>`
  })
})
