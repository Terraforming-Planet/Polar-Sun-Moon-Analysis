import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  buildCube512CellCenters,
  buildCube512LatticeSegments,
  buildCube512LevelLoops,
  buildCube512OuterSegments,
  CUBE512_HALF,
  CUBE512_LED_COLORS,
} from './cube512Geometry'
import './evidence-cube-512.css'

type SlotKind = 'control' | 'north' | 'south'

type Mounted = { element: HTMLElement; cleanup: () => void }
const mounted = new Map<SlotKind, Mounted>()
let scheduled = false

const EARTH_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const CLOUD_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'

function flattenSegments(segments: ReturnType<typeof buildCube512LatticeSegments>) {
  const values: number[] = []
  for (const [a, b] of segments) values.push(...a, ...b)
  return values
}

function lineSegments(segments: ReturnType<typeof buildCube512LatticeSegments>, material: THREE.LineBasicMaterial) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(flattenSegments(segments), 3))
  return new THREE.LineSegments(geometry, material)
}

function createEarth(scene: THREE.Scene) {
  const group = new THREE.Group()
  const radius = 1.18
  const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x176aa0, roughness: 0.88 })
  const earth = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), earthMaterial)
  group.add(earth)

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  loader.load(EARTH_TEXTURE, texture => {
    texture.colorSpace = THREE.SRGBColorSpace
    earthMaterial.map = texture
    earthMaterial.color.set(0xffffff)
    earthMaterial.needsUpdate = true
  })

  const cloudMaterial = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.38, depthWrite: false })
  loader.load(CLOUD_TEXTURE, texture => {
    texture.colorSpace = THREE.SRGBColorSpace
    cloudMaterial.map = texture
    cloudMaterial.needsUpdate = true
  })
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 64, 48), cloudMaterial)
  group.add(clouds)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.07, 48, 36),
    new THREE.MeshBasicMaterial({ color: 0x6fcfff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }),
  )
  group.add(atmosphere)
  scene.add(group)
  return { group, earth, clouds }
}

function renderEvidenceCube(host: HTMLElement, label: string) {
  host.replaceChildren()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 100)
  camera.position.set(9.6, 8.2, 8.8)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x020710, 1)
  host.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.42
  controls.minDistance = 7.2
  controls.maxDistance = 24

  scene.add(new THREE.HemisphereLight(0xcdeeff, 0x02030a, 1.45))
  const key = new THREE.DirectionalLight(0xffffff, 2.1)
  key.position.set(5, 6, 7)
  scene.add(key)

  const centers = buildCube512CellCenters()
  const positions = centers.flat()
  const colors: number[] = []
  centers.forEach((_, index) => {
    const z = Math.floor(index / 64)
    const y = Math.floor((index % 64) / 8)
    const x = index % 8
    const light = (x + y + z) % 2 === 0
    const color = new THREE.Color(light ? 0xeef6fb : 0x222a33)
    colors.push(color.r, color.g, color.b)
  })
  const cellGeometry = new THREE.BufferGeometry()
  cellGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  cellGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const cells = new THREE.Points(cellGeometry, new THREE.PointsMaterial({ size: 0.105, vertexColors: true, transparent: true, opacity: 0.84, sizeAttenuation: true }))
  scene.add(cells)

  const latticeMaterial = new THREE.LineBasicMaterial({ color: 0x1b2633, transparent: true, opacity: 0.58 })
  scene.add(lineSegments(buildCube512LatticeSegments(), latticeMaterial))

  const goldPoints: number[] = []
  const lattice = buildCube512LatticeSegments()
  for (let i = 0; i < lattice.length; i += 17) {
    const [a, b] = lattice[i]
    goldPoints.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  }
  const goldGeometry = new THREE.BufferGeometry()
  goldGeometry.setAttribute('position', new THREE.Float32BufferAttribute(goldPoints, 3))
  scene.add(new THREE.Points(goldGeometry, new THREE.PointsMaterial({ color: 0xd8b15f, size: 0.045, transparent: true, opacity: 0.62 })))

  const outerMaterial = new THREE.LineBasicMaterial({ color: 0xf5f7fa, transparent: true, opacity: 0.96 })
  scene.add(lineSegments(buildCube512OuterSegments(), outerMaterial))

  const loops = buildCube512LevelLoops()
  loops.forEach((loop, index) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(loop.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
    scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: CUBE512_LED_COLORS[index], transparent: true, opacity: 0.76 })))
  })

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(CUBE512_HALF * 2, CUBE512_HALF * 2),
    new THREE.MeshBasicMaterial({ color: 0xf5f7fa, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  )
  base.position.z = -CUBE512_HALF - 0.015
  scene.add(base)

  const { earth, clouds } = createEarth(scene)

  const annotation = document.createElement('div')
  annotation.className = 'evidence-cube512-annotation'
  annotation.innerHTML = `<strong>${label}</strong><span>512 pól · 8 poziomów LED · centrum (0,0,0)</span><span>Białe ściany boczne: OFF · biała podstawa: ON</span>`
  host.appendChild(annotation)

  let frame = 0
  let previous = performance.now()
  const resize = () => {
    const rect = host.getBoundingClientRect()
    const width = Math.max(280, rect.width)
    const height = Math.max(390, Math.min(680, width * 0.78))
    host.style.height = `${height}px`
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  const animate = (now: number) => {
    frame = requestAnimationFrame(animate)
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
    previous = now
    earth.rotation.y += dt * 0.14
    clouds.rotation.y += dt * 0.17
    controls.update()
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(animate)

  return () => {
    cancelAnimationFrame(frame)
    ro.disconnect()
    controls.dispose()
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        const material = object.material
        if (Array.isArray(material)) material.forEach(item => item.dispose())
        else material.dispose()
      }
    })
    renderer.dispose()
    host.replaceChildren()
  }
}

function buildSection(kind: SlotKind, title: string, subtitle: string) {
  const section = document.createElement('section')
  section.className = 'evidence-cube512-card'
  section.dataset.evidenceCube512 = kind
  section.innerHTML = `<div class="evidence-cube512-head"><div><small>CHESSARENA512AI · SPATIAL EVIDENCE FRAME</small><h2>${title}</h2><p>${subtitle}</p></div><span class="evidence-cube512-badge">8×8×8 · 512</span></div><div class="evidence-cube512-host" role="img" aria-label="Interaktywny przezroczysty sześcian 8 na 8 na 8 z Ziemią w centrum"></div>`
  return section
}

function removeStale() {
  for (const [kind, entry] of mounted) {
    if (!entry.element.isConnected) {
      entry.cleanup()
      mounted.delete(kind)
    }
  }
}

function ensureControl() {
  if (mounted.has('control')) return
  const hero = document.querySelector<HTMLElement>('.hero.compact')
  if (!hero || !hero.textContent?.includes('Centrum sterowania')) return
  const section = buildSection('control', 'Przestrzenne centrum dowodów — 512 pól', 'Ziemia znajduje się dokładnie w centrum transparentnej ramy 8×8×8. Model jest warstwą wizualną i nie zmienia danych naukowych.')
  hero.insertAdjacentElement('afterend', section)
  const host = section.querySelector<HTMLElement>('.evidence-cube512-host')!
  mounted.set('control', { element: section, cleanup: renderEvidenceCube(host, 'Centrum dowodów · Ziemia') })
}

function ensurePolar(kind: 'north' | 'south') {
  if (mounted.has(kind)) return
  const heading = [...document.querySelectorAll<HTMLElement>('.workspace-head h1')].find(node => node.textContent?.includes(kind === 'north' ? 'Biegun północny' : 'Biegun południowy'))
  const workspace = heading?.closest<HTMLElement>('.workspace')
  if (!workspace) return
  const selector = workspace.querySelector<HTMLElement>('.selector-grid')
  if (!selector) return
  const title = kind === 'north' ? 'Biegun północny — rama przestrzenna 512' : 'Biegun południowy — rama przestrzenna 512'
  const section = buildSection(kind, title, 'Ziemia pozostaje w punkcie centralnym sześcianu. Widok służy jako przestrzenna adnotacja do zweryfikowanych danych polarnych JPL.')
  selector.insertAdjacentElement('afterend', section)
  const host = section.querySelector<HTMLElement>('.evidence-cube512-host')!
  mounted.set(kind, { element: section, cleanup: renderEvidenceCube(host, kind === 'north' ? 'North Pole · Ziemia' : 'South Pole · Ziemia') })
}

function sync() {
  scheduled = false
  removeStale()
  ensureControl()
  ensurePolar('north')
  ensurePolar('south')
}

function scheduleSync() {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(sync)
}

const observer = new MutationObserver(scheduleSync)
observer.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('beforeunload', () => {
  observer.disconnect()
  mounted.forEach(entry => entry.cleanup())
  mounted.clear()
})
scheduleSync()
