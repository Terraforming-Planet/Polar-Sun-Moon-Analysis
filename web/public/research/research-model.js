import * as THREE from 'https://esm.sh/three@0.179.1'
import { OrbitControls } from 'https://esm.sh/three@0.179.1/examples/jsm/controls/OrbitControls.js'

const NASA_GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
const NASA_LAYER = 'VIIRS_SNPP_CorrectedReflectance_TrueColor'

function gibsUrl(date) {
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', FORMAT: 'image/jpeg',
    TRANSPARENT: 'FALSE', LAYERS: NASA_LAYER, CRS: 'EPSG:4326', STYLES: '',
    WIDTH: '2048', HEIGHT: '1024', BBOX: '-90,-180,90,180', TIME: date,
  })
  return `${NASA_GIBS}?${params}`
}

async function resolveEarthTexture() {
  try {
    const response = await fetch('../data/satellite-manifest.json', { cache: 'no-store' })
    if (response.ok) {
      const manifest = await response.json()
      const source = (manifest.sources || []).find(item => item.id === 'nasa-gibs-viirs-snpp-true-color')
      const frame = source?.frames?.[0]
      if (frame?.localPreviewPath) {
        return { url: `../${frame.localPreviewPath}`, observedUtc: frame.timestampUtc, source: 'NASA GIBS / notebook manifest' }
      }
    }
  } catch (error) {
    console.warn('Satellite manifest unavailable, using direct NASA GIBS fallback.', error)
  }

  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  const date = now.toISOString().slice(0, 10)
  return { url: gibsUrl(date), observedUtc: `${date}T00:00:00Z`, source: 'NASA GIBS direct WMS fallback' }
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(url, texture => {
      texture.colorSpace = THREE.SRGBColorSpace
      resolve(texture)
    }, undefined, reject)
  })
}

async function buildEarthOnly(host) {
  if (!host) return
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x02050c)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(0, 0.35, 3.25)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.replaceChildren(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 1.55
  controls.maxDistance = 8

  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 2.25)
  sun.position.set(4, 2, 5)
  scene.add(sun)

  const textureInfo = await resolveEarthTexture()
  let texture
  try {
    texture = await loadTexture(textureInfo.url)
  } catch (error) {
    console.warn('NASA texture failed; Earth will use a safe colour fallback.', error)
  }

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({
      map: texture || null,
      color: texture ? 0xffffff : 0x2d78b7,
      roughness: 0.92,
      metalness: 0,
    }),
  )
  earth.rotation.z = THREE.MathUtils.degToRad(-23.44)
  scene.add(earth)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.015, 64, 48),
    new THREE.MeshBasicMaterial({ color: 0x6fc7ff, transparent: true, opacity: 0.08, side: THREE.BackSide }),
  )
  scene.add(atmosphere)

  document.querySelectorAll('[data-epoch]').forEach(node => {
    node.textContent = `${textureInfo.observedUtc} · ${textureInfo.source}`
  })

  let spinning = true
  document.getElementById('std-play')?.addEventListener('click', () => { spinning = true })
  document.getElementById('std-stop')?.addEventListener('click', () => { spinning = false })

  const resize = () => {
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(host)
  resize()

  let last = performance.now()
  const animate = now => {
    requestAnimationFrame(animate)
    const delta = Math.min(now - last, 50)
    last = now
    if (spinning) earth.rotation.y += delta * 0.00008
    controls.update()
    renderer.render(scene, camera)
  }
  animate(performance.now())
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
    document.getElementById('coord-x').textContent = x
    document.getElementById('coord-y').textContent = y
    document.getElementById('coord-z').textContent = z
    cells.forEach((cell, i) => cell.classList.toggle('selected', i === index))
  }

  const applyLayerFilter = () => {
    layers.forEach((layer, z) => {
      const active = activeLayer === null || z === activeLayer
      layer.style.opacity = active ? '0.9' : '0.08'
      layer.style.filter = active ? 'none' : 'grayscale(.6)'
    })
    ;[...controls.children].forEach((button, z) => button.classList.toggle('active', activeLayer === z))
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

async function start() {
  buildPlanetaryGrid()
  await buildEarthOnly(document.getElementById('solar-standard'))
}

start().catch(error => {
  console.error(error)
  const host = document.getElementById('solar-standard')
  if (host && !host.querySelector('canvas')) {
    host.innerHTML = `<div class="model-error">Model Ziemi nie został uruchomiony: ${String(error.message || error)}</div>`
  }
})
