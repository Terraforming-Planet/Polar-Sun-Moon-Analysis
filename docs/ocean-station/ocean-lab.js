import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const $ = selector => document.querySelector(selector)
const viewer = $('#oceanViewer')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x06243a)
scene.fog = new THREE.FogExp2(0x06243a, 0.009)

const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 400)
const defaultCamera = { position: [44, 30, 48], target: [0, -6, 0] }
camera.position.set(...defaultCamera.position)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.domElement.style.touchAction = 'none'
viewer.append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.target.set(...defaultCamera.target)
controls.minDistance = 10
controls.maxDistance = 145
controls.enablePan = true
controls.screenSpacePanning = true
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
controls.touches.ONE = THREE.TOUCH.ROTATE
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN

scene.add(new THREE.HemisphereLight(0xd8f5ff, 0x163047, 2.55))
scene.add(new THREE.AmbientLight(0x9edcff, 0.62))
const sun = new THREE.DirectionalLight(0xffffff, 2.65)
sun.position.set(-35, 52, 25)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
scene.add(sun)
const fill = new THREE.DirectionalLight(0x58bfff, 1.05)
fill.position.set(30, 18, -35)
scene.add(fill)

const seabedBase = -8
const bathy = new THREE.PlaneGeometry(120, 120, 96, 96)
const p = bathy.attributes.position
for (let i = 0; i < p.count; i++) {
  const x = p.getX(i)
  const y = p.getY(i)
  const ridge = 1.2 * Math.sin(x * 0.12) + 0.75 * Math.cos(y * 0.16) + 0.45 * Math.sin((x + y) * 0.22)
  const trench = -5.2 * Math.exp(-Math.pow((y + x * 0.28 - 9) / 8.5, 2))
  const rise = 2.0 * Math.exp(-((x + 30) ** 2 + (y - 12) ** 2) / 260)
  p.setZ(i, seabedBase + ridge + trench + rise)
}
p.needsUpdate = true
bathy.computeVertexNormals()
bathy.rotateX(-Math.PI / 2)
const seabed = new THREE.Mesh(
  bathy,
  new THREE.MeshStandardMaterial({ color: 0x1c5266, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide })
)
seabed.receiveShadow = true
scene.add(seabed)

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(122, 122),
  new THREE.MeshPhysicalMaterial({ color: 0x1596c8, transparent: true, opacity: 0.22, roughness: 0.16, metalness: 0.04, transmission: 0.08, side: THREE.DoubleSide, depthWrite: false })
)
water.rotation.x = -Math.PI / 2
water.position.y = 0
scene.add(water)

const boundaryPoints = []
for (let i = -55; i <= 55; i += 2) boundaryPoints.push(new THREE.Vector3(i, seabedBase - 0.15, 9 - i * 0.28))
const boundary = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(boundaryPoints),
  new THREE.LineBasicMaterial({ color: 0xffb257, transparent: true, opacity: 0.8 })
)
scene.add(boundary)

const quakeGroup = new THREE.Group()
const quakePositions = [
  [-42, -7.4, 20], [-33, -8.2, 18], [-24, -9.0, 16], [-16, -9.8, 14], [-8, -10.7, 12], [0, -11.2, 9],
  [10, -10.0, 7], [19, -9.1, 5], [28, -8.5, 2], [37, -8.1, -2], [46, -7.7, -5], [-5, -8.6, 17], [17, -8.4, 11]
]
const qGeo = new THREE.SphereGeometry(0.35, 10, 8)
const qMat = new THREE.MeshBasicMaterial({ color: 0xff6c77 })
for (const [x, y, z] of quakePositions) {
  const q = new THREE.Mesh(qGeo, qMat)
  q.position.set(x, y, z)
  quakeGroup.add(q)
}
scene.add(quakeGroup)

const researchObjects = []
const userMarkers = []
const STORAGE_KEY = 'terra-ocean-station-work-v1'
const WORKSPACE_VERSION = 1
let selected = null
let pairSeq = 1
let markerSeq = 1
let gridMesh = null
let markerMode = false
let pointerStart = null

function makeToolbar() {
  const bar = document.createElement('div')
  bar.className = 'workspace-toolbar'
  bar.setAttribute('aria-label', 'Narzędzia obszaru roboczego')
  bar.innerHTML = `
    <button id="markerMode" type="button">＋ Znacznik</button>
    <button id="resetView" type="button">Reset widoku</button>
    <button id="saveWorkspace" type="button">Zapisz pracę</button>
    <button id="loadWorkspace" type="button">Wczytaj</button>
    <button id="exportWorkspace" type="button">Eksport JSON</button>
  `
  viewer.append(bar)
  const hint = document.createElement('div')
  hint.className = 'workspace-privacy'
  hint.textContent = 'Zapis obejmuje scenę, znaczniki, warstwy i widok. Prywatne pytania do asystenta nie są zapisywane.'
  viewer.append(hint)
}
makeToolbar()

function frustumGeometry(base, top, height, downward = false) {
  const b = base / 2
  const t = top / 2
  const y = downward ? -height : height
  const vertices = new Float32Array([
    -b, 0, -b, b, 0, -b, b, 0, b, -b, 0, b,
    -t, y, -t, t, y, -t, t, y, t, -t, y, t
  ])
  const indices = [0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function volume(base, top, h) {
  const a1 = base * base
  const a2 = top * top
  return h / 3 * (a1 + a2 + Math.sqrt(a1 * a2))
}

function params() {
  return { base: Number($('#baseSize').value), top: Number($('#topSize').value), height: Number($('#heightSize').value) }
}

function positionFor(offset = 0) {
  const n = researchObjects.length
  const angle = (n * 2.399 + offset) % (Math.PI * 2)
  const radius = 14 + (n % 4) * 7
  return new THREE.Vector3(Math.cos(angle) * radius, seabedBase + 0.45, Math.sin(angle) * radius - 9)
}

function addFeature(type, options = {}) {
  const cfg = options.config || params()
  if (cfg.top >= cfg.base) {
    setMessage('Szczyt/dno plateau musi być mniejsze od podstawy.')
    return null
  }
  const downward = type === 'trench'
  const geometry = frustumGeometry(cfg.base, cfg.top, cfg.height, downward)
  const material = new THREE.MeshStandardMaterial({
    color: downward ? 0x7d68c8 : 0x4fc991,
    roughness: 0.76,
    metalness: 0.03,
    transparent: downward,
    opacity: downward ? 0.72 : 1,
    side: THREE.DoubleSide
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = !downward
  mesh.receiveShadow = true
  mesh.position.copy(options.position || positionFor(downward ? 1.1 : 0))
  mesh.userData = {
    kind: type,
    volume: volume(cfg.base, cfg.top, cfg.height),
    pairId: options.pairId || null,
    base: cfg.base,
    top: cfg.top,
    height: cfg.height
  }
  scene.add(mesh)
  researchObjects.push(mesh)
  if (!options.silent) select(mesh)
  updateMetrics()
  return mesh
}

function addPair() {
  const id = `P${pairSeq++}`
  const cfg = params()
  const anchor = positionFor()
  const mountain = addFeature('mountain', { pairId: id, position: anchor.clone().add(new THREE.Vector3(-cfg.base * 0.65, 0, 0)) })
  const trench = addFeature('trench', { pairId: id, position: anchor.clone().add(new THREE.Vector3(cfg.base * 0.65, 0, 0)) })
  if (mountain && trench) setMessage(`Dodano parę ${id}: identyczna objętość góry i rowu w scenie numerycznej.`)
}

function select(mesh) {
  if (selected?.material?.emissive) selected.material.emissive.setHex(0x000000)
  selected = mesh
  if (selected?.material?.emissive) selected.material.emissive.setHex(0x164153)
  const label = selected
    ? `${selected.userData.kind === 'mountain' ? 'góra' : 'rów'} · ${selected.userData.volume.toFixed(1)} km³${selected.userData.pairId ? ` · ${selected.userData.pairId}` : ''}`
    : 'brak'
  $('#selectionHud').textContent = `Zaznaczenie: ${label}`
}

function removeSelected() {
  if (!selected) return setMessage('Najpierw kliknij górę lub rów w scenie.')
  const idx = researchObjects.indexOf(selected)
  if (idx >= 0) researchObjects.splice(idx, 1)
  scene.remove(selected)
  selected.geometry.dispose()
  selected.material.dispose()
  selected = null
  $('#selectionHud').textContent = 'Zaznaczenie: brak'
  updateMetrics()
  setMessage('Usunięto tylko obiekt z symulacji. Dane źródłowe nie są modyfikowane.')
}

function clearResearchObjects() {
  for (const obj of [...researchObjects]) {
    scene.remove(obj)
    obj.geometry.dispose()
    obj.material.dispose()
  }
  researchObjects.length = 0
  selected = null
  pairSeq = 1
  $('#selectionHud').textContent = 'Zaznaczenie: brak'
}

function clearMarkers() {
  for (const marker of userMarkers) {
    scene.remove(marker.group)
    marker.group.traverse(obj => {
      obj.geometry?.dispose?.()
      if (obj.material?.map) obj.material.map.dispose()
      obj.material?.dispose?.()
    })
  }
  userMarkers.length = 0
  markerSeq = 1
}

function resetScene() {
  clearResearchObjects()
  clearMarkers()
  updateMetrics()
  setMessage('Scena proceduralna i znaczniki użytkownika zostały zresetowane.')
}

function resetView() {
  camera.position.set(...defaultCamera.position)
  controls.target.set(...defaultCamera.target)
  controls.update()
  setMessage('Przywrócono bezpieczny widok kamery.')
}

function toggleGrid(forceState = null) {
  const wantGrid = forceState === null ? !gridMesh : Boolean(forceState)
  if (!wantGrid && gridMesh) {
    scene.remove(gridMesh)
    gridMesh.geometry.dispose()
    gridMesh.material.dispose()
    gridMesh = null
    $('#grid512').textContent = 'Włącz siatkę 8×8×8 = 512'
    return
  }
  if (!wantGrid || gridMesh) return
  const g = new THREE.BoxGeometry(1.35, 0.12, 1.35)
  const m = new THREE.MeshBasicMaterial({ color: 0x65dfff, transparent: true, opacity: 0.22 })
  gridMesh = new THREE.InstancedMesh(g, m, 512)
  const dummy = new THREE.Object3D()
  let i = 0
  for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
    dummy.position.set((x - 3.5) * 2.1, seabedBase - 9 + (y - 3.5) * 1.6, (z - 3.5) * 2.1 + 25)
    dummy.updateMatrix()
    gridMesh.setMatrixAt(i++, dummy.matrix)
  }
  gridMesh.instanceMatrix.needsUpdate = true
  scene.add(gridMesh)
  $('#grid512').textContent = 'Wyłącz siatkę 8×8×8 = 512'
  setMessage('512 komórek jest renderowanych przez GPU Instancing. To siatka badawcza, nie 512 fizycznych obiektów na dnie.')
}

function createMarkerLabel(number) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#052134'
  ctx.strokeStyle = '#7cecff'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(64, 64, 48, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 58px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), 64, 66)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set(4.5, 4.5, 1)
  sprite.position.y = 2.2
  return sprite
}

function addUserMarker(position, forcedNumber = null) {
  const number = forcedNumber ?? markerSeq
  markerSeq = Math.max(markerSeq, number + 1)
  const group = new THREE.Group()
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 2.5, 12),
    new THREE.MeshStandardMaterial({ color: 0x7cecff, emissive: 0x0c465a, roughness: 0.45 })
  )
  pin.position.y = 1.25
  group.add(pin)
  group.add(createMarkerLabel(number))
  group.position.copy(position)
  scene.add(group)
  userMarkers.push({ number, group })
  setMessage(`Dodano znacznik ${number}. To adnotacja użytkownika, nie automatyczny pomiar naukowy.`)
}

function rayFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  return raycaster
}

function updateMetrics() {
  const mountains = researchObjects.filter(o => o.userData.kind === 'mountain')
  const trenches = researchObjects.filter(o => o.userData.kind === 'trench')
  const mv = mountains.reduce((s, o) => s + o.userData.volume, 0)
  const tv = trenches.reduce((s, o) => s + o.userData.volume, 0)
  const pairs = new Set(researchObjects.map(o => o.userData.pairId).filter(Boolean))
  $('#mountainCount').textContent = String(mountains.length)
  $('#trenchCount').textContent = String(trenches.length)
  $('#pairCount').textContent = String(pairs.size)
  $('#materialBalance').textContent = `${(tv - mv).toFixed(1)} km³`
  $('#massProxy').textContent = `${(Math.abs(tv - mv) / (1 + tv + mv) * 100).toFixed(2)}%`
}

function updateParameterReadouts() {
  const cfg = params()
  $('#baseOut').textContent = `${cfg.base.toFixed(1)} km`
  $('#topOut').textContent = `${cfg.top.toFixed(1)} km`
  $('#heightOut').textContent = `${cfg.height.toFixed(1)} km`
  $('#volumeOut').textContent = `${volume(cfg.base, cfg.top, cfg.height).toFixed(1)} km³`
}

function setMessage(text) { $('#actionMessage').textContent = text }

function workspaceSnapshot() {
  return {
    schema: 'terra-ocean-station-workspace',
    version: WORKSPACE_VERSION,
    savedAt: new Date().toISOString(),
    privacy: 'raw-assistant-prompts-excluded',
    features: researchObjects.map(obj => ({
      kind: obj.userData.kind,
      pairId: obj.userData.pairId,
      base: obj.userData.base,
      top: obj.userData.top,
      height: obj.userData.height,
      position: obj.position.toArray()
    })),
    markers: userMarkers.map(marker => ({ number: marker.number, position: marker.group.position.toArray() })),
    camera: { position: camera.position.toArray(), target: controls.target.toArray() },
    layers: {
      water: water.visible,
      boundary: boundary.visible,
      grid512: Boolean(gridMesh),
      verticalExaggeration: Number($('#verticalExaggeration').value)
    }
  }
}

function applyWorkspace(data) {
  if (!data || data.schema !== 'terra-ocean-station-workspace' || data.version !== WORKSPACE_VERSION) {
    throw new Error('Nieobsługiwany format zapisu stacji.')
  }
  clearResearchObjects()
  clearMarkers()
  for (const feature of data.features || []) {
    if (!['mountain', 'trench'].includes(feature.kind)) continue
    const cfg = { base: Number(feature.base), top: Number(feature.top), height: Number(feature.height) }
    if (![cfg.base, cfg.top, cfg.height].every(Number.isFinite) || cfg.top >= cfg.base) continue
    const position = new THREE.Vector3(...feature.position.map(Number))
    addFeature(feature.kind, { config: cfg, pairId: feature.pairId || null, position, silent: true })
  }
  for (const marker of data.markers || []) {
    if (!Array.isArray(marker.position) || marker.position.length !== 3) continue
    addUserMarker(new THREE.Vector3(...marker.position.map(Number)), Number(marker.number) || markerSeq)
  }
  if (data.camera?.position?.length === 3 && data.camera?.target?.length === 3) {
    camera.position.set(...data.camera.position.map(Number))
    controls.target.set(...data.camera.target.map(Number))
  }
  const layers = data.layers || {}
  water.visible = layers.water !== false
  boundary.visible = layers.boundary !== false
  quakeGroup.visible = boundary.visible
  $('#showWater').checked = water.visible
  $('#showBoundary').checked = boundary.visible
  toggleGrid(Boolean(layers.grid512))
  const vertical = Math.min(4, Math.max(0.5, Number(layers.verticalExaggeration) || 1))
  $('#verticalExaggeration').value = String(vertical)
  $('#verticalOut').textContent = `${vertical.toFixed(1)}×`
  seabed.scale.y = vertical
  for (const obj of researchObjects) obj.scale.y = vertical
  controls.update()
  updateMetrics()
}

function saveWorkspace() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceSnapshot()))
    setMessage('Praca stacji została zapisana lokalnie w tej przeglądarce. Prywatne pytania nie są częścią zapisu.')
  } catch (error) {
    setMessage(`Nie udało się zapisać pracy lokalnie: ${String(error)}`)
  }
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return setMessage('Brak lokalnie zapisanej pracy tej stacji.')
    applyWorkspace(JSON.parse(raw))
    setMessage('Wczytano lokalny zapis pracy stacji.')
  } catch (error) {
    setMessage(`Nie udało się wczytać zapisu: ${String(error)}`)
  }
}

function exportWorkspace() {
  const blob = new Blob([JSON.stringify(workspaceSnapshot(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `terra-ocean-station-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  setMessage('Wyeksportowano przenośny plik JSON bez prywatnej historii pytań do asystenta.')
}

$('#addMountain').addEventListener('click', () => { const x = addFeature('mountain'); if (x) setMessage('Dodano podwodną górę do sceny badawczej.') })
$('#addTrench').addEventListener('click', () => { const x = addFeature('trench'); if (x) setMessage('Dodano dolinę/rów do sceny badawczej. Nie jest to instrukcja realnego pogłębiania.') })
$('#addPair').addEventListener('click', addPair)
$('#removeSelected').addEventListener('click', removeSelected)
$('#resetScene').addEventListener('click', resetScene)
$('#grid512').addEventListener('click', () => toggleGrid())
for (const id of ['baseSize', 'topSize', 'heightSize']) $('#' + id).addEventListener('input', updateParameterReadouts)

$('#showWater').addEventListener('change', e => { water.visible = e.target.checked })
$('#showBoundary').addEventListener('change', e => { boundary.visible = e.target.checked; quakeGroup.visible = e.target.checked })
$('#verticalExaggeration').addEventListener('input', e => {
  const factor = Number(e.target.value)
  $('#verticalOut').textContent = `${factor.toFixed(1)}×`
  seabed.scale.y = factor
  for (const obj of researchObjects) obj.scale.y = factor
  setMessage('Przewyższenie pionowe zmienia wyłącznie wizualizację, nie geometrię danych ani obliczoną objętość.')
})

$('#markerMode').addEventListener('click', () => {
  markerMode = !markerMode
  $('#markerMode').classList.toggle('active', markerMode)
  setMessage(markerMode ? 'Tryb znacznika aktywny: kliknij dno, aby dodać numerowaną adnotację.' : 'Tryb znacznika wyłączony.')
})
$('#resetView').addEventListener('click', resetView)
$('#saveWorkspace').addEventListener('click', saveWorkspace)
$('#loadWorkspace').addEventListener('click', loadWorkspace)
$('#exportWorkspace').addEventListener('click', exportWorkspace)

renderer.domElement.addEventListener('contextmenu', event => event.preventDefault())
renderer.domElement.addEventListener('pointerdown', event => {
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }
})
renderer.domElement.addEventListener('pointerup', event => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  pointerStart = null
  if (moved > 7) return
  const raycaster = rayFromEvent(event)
  if (markerMode) {
    const hit = raycaster.intersectObject(seabed, false)[0]
    if (hit) {
      addUserMarker(hit.point.clone().add(new THREE.Vector3(0, 0.2, 0)))
      markerMode = false
      $('#markerMode').classList.remove('active')
    }
    return
  }
  const hit = raycaster.intersectObjects(researchObjects, false)[0]
  if (hit) select(hit.object)
})

function resize() {
  const width = Math.max(1, viewer.clientWidth)
  const height = Math.max(1, viewer.clientHeight)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewer)
resize()

function animate(t) {
  requestAnimationFrame(animate)
  controls.update()
  water.material.opacity = 0.20 + 0.03 * Math.sin(t * 0.00065)
  if (gridMesh) gridMesh.rotation.y = Math.sin(t * 0.00015) * 0.08
  renderer.render(scene, camera)
}

updateParameterReadouts()
updateMetrics()
addPair()
animate(0)

fetch('./research-registry.json', { cache: 'no-store' })
  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(data => {
    $('#registryStatus').textContent = `Rejestr badawczy: ${data.sources.length} zweryfikowanych źródeł · aktualizacja ${data.updated_utc}`
  })
  .catch(err => { $('#registryStatus').textContent = `Rejestr badawczy niedostępny: ${String(err)}` })
