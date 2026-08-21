import * as THREE from 'https://esm.sh/three@0.180.0'
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js?deps=three@0.180.0'

const AU_KM = 149_597_870.7
const BODY_STYLE = {
  Sun: { color: 0xffd166, size: 0.95, emissive: 0xff9f1c },
  Mercury: { color: 0x9d958f, size: 0.19 },
  Venus: { color: 0xd9ad67, size: 0.29 },
  Earth: { color: 0x2f86d6, size: 0.32 },
  Moon: { color: 0xc8c8c8, size: 0.13 },
  Mars: { color: 0xc65a3c, size: 0.24 },
  Jupiter: { color: 0xd5b38c, size: 0.64 },
  Saturn: { color: 0xe1c477, size: 0.56 },
  Uranus: { color: 0x7ddfe4, size: 0.43 },
  Neptune: { color: 0x496ee8, size: 0.42 },
}
const TARGETS = ['Moon', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']

function vectorLength(values) {
  return Math.hypot(values[0], values[1], values[2])
}

function compressedRadius(distanceAu) {
  if (distanceAu <= 0) return 0
  return 3 + Math.log1p(distanceAu) * 5.65
}

function vectorToDisplay(values) {
  const raw = new THREE.Vector3(...values)
  const distance = raw.length()
  if (!distance) return raw
  return raw.normalize().multiplyScalar(compressedRadius(distance))
}

function makeLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 96
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = '700 34px Inter, system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#eaf8ff'
  context.shadowColor = '#00131f'
  context.shadowBlur = 12
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(2.3, 0.7, 1)
  return sprite
}

function addStars(scene) {
  const count = 1200
  const positions = new Float32Array(count * 3)
  let seed = 0x51f15e
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let i = 0; i < count; i += 1) {
    const radius = 50 + random() * 65
    const theta = random() * Math.PI * 2
    const phi = Math.acos(2 * random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.cos(phi)
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xbfeaff, size: 0.075, transparent: true, opacity: 0.8 })))
}

async function loadSolarSnapshot() {
  const response = await fetch('../data/solar-system.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`solar-system.json HTTP ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data.bodies) || data.bodies.length < 3) throw new Error('Invalid solar-system.json body list')
  return data
}

function createOrbit(radius) {
  const geometry = new THREE.RingGeometry(Math.max(0.01, radius - 0.015), radius + 0.015, 160)
  const material = new THREE.MeshBasicMaterial({ color: 0x2f7699, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  return new THREE.Mesh(geometry, material)
}

async function buildSolarSystem() {
  const host = document.getElementById('viewport')
  if (!host) return null

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x02050c)
  addStars(scene)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 250)
  camera.position.set(0, 18, 30)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'space-canvas'
  host.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 2.5
  controls.maxDistance = 90

  scene.add(new THREE.AmbientLight(0x39536f, 0.58))
  const sunLight = new THREE.PointLight(0xffffff, 65, 130, 1.4)
  scene.add(sunLight)

  const root = new THREE.Group()
  scene.add(root)

  const snapshot = await loadSolarSnapshot()
  const byName = new Map(snapshot.bodies.map(body => [body.body, body]))
  const objects = new Map()
  const labels = []
  const orbits = []

  const earthRaw = byName.get('Earth')?.position_au
  const moonRaw = byName.get('Moon')?.position_au

  for (const body of snapshot.bodies) {
    const style = BODY_STYLE[body.body]
    if (!style) continue
    let position = vectorToDisplay(body.position_au)
    if (body.body === 'Moon' && earthRaw && moonRaw) {
      const earthPosition = vectorToDisplay(earthRaw)
      const moonDelta = new THREE.Vector3(
        moonRaw[0] - earthRaw[0],
        moonRaw[1] - earthRaw[1],
        moonRaw[2] - earthRaw[2],
      )
      position = earthPosition.add(moonDelta.normalize().multiplyScalar(0.82))
    }

    const material = body.body === 'Sun'
      ? new THREE.MeshStandardMaterial({ color: style.color, emissive: style.emissive, emissiveIntensity: 1.8, roughness: 0.65 })
      : new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.82, metalness: 0.02 })

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(style.size, 36, 28), material)
    mesh.position.copy(position)
    mesh.userData.body = body.body
    root.add(mesh)
    objects.set(body.body, mesh)

    const label = makeLabel(body.body)
    label.position.copy(position).add(new THREE.Vector3(0, style.size + 0.55, 0))
    root.add(label)
    labels.push(label)

    if (body.body === 'Saturn') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 1.08, 72),
        new THREE.MeshBasicMaterial({ color: 0xcbbd8d, transparent: true, opacity: 0.68, side: THREE.DoubleSide }),
      )
      ring.rotation.x = Math.PI * 0.46
      mesh.add(ring)
    }

    const distance = vectorLength(body.position_au)
    if (!['Sun', 'Moon'].includes(body.body) && distance > 0) {
      const orbit = createOrbit(compressedRadius(distance))
      root.add(orbit)
      orbits.push(orbit)
    }
  }

  const sunMesh = objects.get('Sun')
  if (sunMesh) sunLight.position.copy(sunMesh.position)

  const epochText = String(snapshot.timestamp_utc || 'unknown UTC')
  const epochNode = document.getElementById('epoch')
  if (epochNode) epochNode.textContent = epochText.slice(0, 10)
  const bodyCount = document.getElementById('body-count')
  if (bodyCount) bodyCount.textContent = String(objects.size)
  document.getElementById('model-readout').textContent = `NASA/JPL Horizons snapshot: ${epochText}. Distances are compressed for one-screen navigation; angular direction is preserved from stored heliocentric vectors.`

  let autoRotate = true
  let orbitsVisible = true
  let labelsVisible = true
  let last = performance.now()

  function updateButton(id, text) {
    const node = document.getElementById(id)
    if (node) node.textContent = text
  }

  function resetView() {
    autoRotate = true
    updateButton('rotate', 'Auto rotate: ON')
    root.rotation.set(0, 0, 0)
    camera.position.set(0, 18, 30)
    controls.target.set(0, 0, 0)
    controls.update()
    document.getElementById('focus').value = 'overview'
  }

  function focusBody(name) {
    const object = objects.get(name)
    if (!object) return
    autoRotate = false
    updateButton('rotate', 'Auto rotate: OFF')
    root.updateMatrixWorld(true)
    const target = new THREE.Vector3()
    object.getWorldPosition(target)
    controls.target.copy(target)
    const distance = name === 'Sun' ? 5.5 : name === 'Jupiter' || name === 'Saturn' ? 3.7 : 2.6
    camera.position.copy(target).add(new THREE.Vector3(distance * 0.7, distance * 0.45, distance))
    controls.update()
    const select = document.getElementById('focus')
    if (select) select.value = name
  }

  document.getElementById('reset')?.addEventListener('click', resetView)
  document.getElementById('rotate')?.addEventListener('click', () => {
    autoRotate = !autoRotate
    updateButton('rotate', `Auto rotate: ${autoRotate ? 'ON' : 'OFF'}`)
  })
  document.getElementById('orbits')?.addEventListener('click', () => {
    orbitsVisible = !orbitsVisible
    orbits.forEach(item => { item.visible = orbitsVisible })
    updateButton('orbits', `Orbits: ${orbitsVisible ? 'ON' : 'OFF'}`)
  })
  document.getElementById('labels')?.addEventListener('click', () => {
    labelsVisible = !labelsVisible
    labels.forEach(item => { item.visible = labelsVisible })
    updateButton('labels', `Labels: ${labelsVisible ? 'ON' : 'OFF'}`)
  })
  document.getElementById('focus')?.addEventListener('change', event => {
    const value = event.target.value
    if (value === 'overview') resetView()
    else focusBody(value)
  })
  document.querySelectorAll('.focus-body').forEach(button => button.addEventListener('click', () => focusBody(button.dataset.body)))

  const resize = () => {
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(host)
  resize()

  function frame(now) {
    requestAnimationFrame(frame)
    const delta = Math.min(50, now - last)
    last = now
    if (autoRotate) root.rotation.y += delta * 0.000045
    for (const [name, object] of objects) if (name !== 'Sun') object.rotation.y += delta * 0.00012
    const utc = document.getElementById('utc')
    if (utc) utc.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    controls.update()
    renderer.render(scene, camera)
  }
  frame(performance.now())

  return { snapshot, focusBody }
}

function cellAddress(index) {
  return `CELL-${String(index + 1).padStart(3, '0')}`
}

function decodeCell(index) {
  const z = Math.floor(index / 64)
  const rest = index % 64
  return { x: rest % 8, y: Math.floor(rest / 8), z }
}

function buildPlanetaryGrid() {
  const stage = document.getElementById('cube-stage')
  const controls = document.getElementById('layer-controls')
  const list = document.getElementById('cell-list')
  const legend = document.getElementById('legend')
  if (!stage || !controls || !list || !legend) return

  const cells = []
  const layers = []
  let activeLayer = null

  const updateReadout = index => {
    const { x, y, z } = decodeCell(index)
    document.getElementById('cell-address').textContent = cellAddress(index)
    document.getElementById('cell-index').textContent = `index ${index} · X${x} Y${y} Z${z}`
    document.getElementById('coord-x').textContent = String(x)
    document.getElementById('coord-y').textContent = String(y)
    document.getElementById('coord-z').textContent = String(z)
    cells.forEach((cell, i) => cell.classList.toggle('selected', i === index))
  }

  const applyLayerFilter = () => {
    layers.forEach((layer, z) => {
      const active = activeLayer === null || z === activeLayer
      layer.style.opacity = active ? '0.92' : '0.08'
      layer.style.filter = active ? 'none' : 'grayscale(.65)'
    })
    Array.from(controls.children).forEach((button, z) => button.classList.toggle('active', activeLayer === z))
  }

  const layerGap = 72
  for (let z = 0; z < 8; z += 1) {
    const layer = document.createElement('div')
    layer.className = 'voxel-layer'
    layer.dataset.layer = String(z)
    layer.style.setProperty('--z', `${(z - 3.5) * layerGap}px`)
    layers.push(layer)

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const index = z * 64 + y * 8 + x
        const button = document.createElement('button')
        button.className = 'voxel-cell'
        button.type = 'button'
        button.dataset.index = String(index)
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

  updateReadout(0)
  if (cells.length !== 512) throw new Error(`Grid integrity error: expected 512 cells, got ${cells.length}`)
}

function installImageFallbacks() {
  document.querySelectorAll('.image-frame img').forEach(image => {
    image.addEventListener('error', () => image.classList.add('failed'))
    image.addEventListener('load', () => image.classList.remove('failed'))
  })
}

function frameAvailable(id) {
  const image = document.getElementById(id)
  return Boolean(image && image.complete && image.naturalWidth > 0)
}

function setupCometReadiness() {
  const button = document.getElementById('comet-scan')
  const readiness = document.getElementById('frame-readiness')
  const candidate = document.getElementById('candidate-state')
  const output = document.getElementById('ai-output')
  if (!button || !readiness || !candidate || !output) return

  const refresh = () => {
    const c2 = frameAvailable('soho-c2')
    const c3 = frameAvailable('soho-c3')
    readiness.textContent = c2 && c3 ? 'C2 + C3 official frames online' : c2 || c3 ? 'One SOHO frame online' : 'SOHO preview not readable here'
    return c2 && c3
  }
  document.getElementById('soho-c2')?.addEventListener('load', refresh)
  document.getElementById('soho-c3')?.addEventListener('load', refresh)
  window.setTimeout(refresh, 1200)

  button.addEventListener('click', () => {
    const ready = refresh()
    candidate.textContent = 'No verified candidate asserted'
    output.textContent = ready
      ? 'Both official SOHO views are available. The evidence bundle is ready for a server-side OpenAI vision pass. Until that worker returns frame-linked motion evidence, this page deliberately reports no comet candidate.'
      : 'The page cannot obtain both official SOHO preview frames in this browser. AI classification is blocked rather than guessing. Use the official SOHO source links or retry later.'
  })
}

function populatePlanetLab(snapshot) {
  const bodies = new Map(snapshot.bodies.map(body => [body.body, body]))
  const earth = bodies.get('Earth')
  const moon = bodies.get('Moon')
  const moonDistance = document.getElementById('moon-distance')
  const moonNote = document.getElementById('moon-distance-note')

  if (earth && moon) {
    const distanceAu = Math.hypot(
      moon.position_au[0] - earth.position_au[0],
      moon.position_au[1] - earth.position_au[1],
      moon.position_au[2] - earth.position_au[2],
    )
    const distanceKm = distanceAu * AU_KM
    moonDistance.textContent = `${Math.round(distanceKm).toLocaleString('en-US')} km`
    moonNote.textContent = `Derived from the Earth and Moon heliocentric ICRF vectors stored at ${snapshot.timestamp_utc}. This is a timestamped ephemeris-derived value, not a permanent Moon distance.`
  } else {
    moonDistance.textContent = 'No data'
    moonNote.textContent = 'Earth or Moon vector missing from solar-system.json.'
  }

  document.getElementById('planet-epoch').textContent = String(snapshot.timestamp_utc || 'unknown')
  const buttons = document.getElementById('target-buttons')
  const readout = document.getElementById('planet-readout')

  const show = name => {
    const body = bodies.get(name)
    if (!body) return
    buttons.querySelectorAll('button').forEach(item => item.classList.toggle('active', item.dataset.body === name))
    const distance = vectorLength(body.position_au)
    readout.innerHTML = `
      <div class="vector-box"><span>Body</span><b>${name}</b></div>
      <div class="vector-box"><span>Heliocentric distance</span><b>${distance.toFixed(6)} AU</b></div>
      <div class="vector-box"><span>X (ICRF)</span><b>${body.position_au[0].toFixed(9)} AU</b></div>
      <div class="vector-box"><span>Y (ICRF)</span><b>${body.position_au[1].toFixed(9)} AU</b></div>
      <div class="vector-box"><span>Z (ICRF)</span><b>${body.position_au[2].toFixed(9)} AU</b></div>
      <div class="vector-box"><span>Provenance</span><b>NASA/JPL Horizons</b></div>`
  }

  for (const name of TARGETS) {
    if (!bodies.has(name)) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.body = name
    button.textContent = name
    button.addEventListener('click', () => {
      show(name)
      document.getElementById('focus').value = name
      window.dispatchEvent(new CustomEvent('terra-focus-body', { detail: name }))
    })
    buttons.appendChild(button)
  }
  show('Moon')
}

async function start() {
  installImageFallbacks()
  setupCometReadiness()
  buildPlanetaryGrid()

  try {
    const solar = await buildSolarSystem()
    if (!solar) return
    populatePlanetLab(solar.snapshot)
    window.addEventListener('terra-focus-body', event => solar.focusBody(event.detail))
  } catch (error) {
    console.error(error)
    const host = document.getElementById('viewport')
    const readout = document.getElementById('model-readout')
    if (readout) readout.textContent = `3D model failed safely: ${String(error.message || error)}`
    if (host && !host.querySelector('canvas')) {
      const fallback = document.createElement('div')
      fallback.className = 'model-readout'
      fallback.style.top = '50%'
      fallback.style.bottom = 'auto'
      fallback.textContent = 'WebGL model unavailable. The observation and 512-cell modules remain usable.'
      host.appendChild(fallback)
    }
  }
}

start()
