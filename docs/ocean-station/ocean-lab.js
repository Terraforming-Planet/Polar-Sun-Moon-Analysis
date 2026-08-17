import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const $ = selector => document.querySelector(selector)
const viewer = $('#oceanViewer')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x03121d)
scene.fog = new THREE.FogExp2(0x03121d, 0.011)

const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 400)
camera.position.set(44, 30, 48)

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance'})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
viewer.append(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.target.set(0, -6, 0)
controls.minDistance = 10
controls.maxDistance = 145

scene.add(new THREE.HemisphereLight(0x9bddff, 0x061019, 1.9))
const sun = new THREE.DirectionalLight(0xffffff, 2.2)
sun.position.set(-35, 52, 25)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
scene.add(sun)

const seabedBase = -8
const bathy = new THREE.PlaneGeometry(120, 120, 96, 96)
const p = bathy.attributes.position
for (let i=0;i<p.count;i++) {
  const x = p.getX(i)
  const y = p.getY(i)
  const ridge = 1.2*Math.sin(x*0.12) + 0.75*Math.cos(y*0.16) + 0.45*Math.sin((x+y)*0.22)
  const trench = -5.2*Math.exp(-Math.pow((y + x*0.28 - 9)/8.5, 2))
  const rise = 2.0*Math.exp(-((x+30)**2 + (y-12)**2)/260)
  p.setZ(i, seabedBase + ridge + trench + rise)
}
p.needsUpdate = true
bathy.computeVertexNormals()
bathy.rotateX(-Math.PI/2)
const seabed = new THREE.Mesh(bathy, new THREE.MeshStandardMaterial({color:0x153947, roughness:0.94, metalness:0.02, side:THREE.DoubleSide}))
seabed.receiveShadow = true
scene.add(seabed)

const water = new THREE.Mesh(new THREE.PlaneGeometry(122,122), new THREE.MeshPhysicalMaterial({color:0x0d76a0, transparent:true, opacity:0.28, roughness:0.18, metalness:0.04, transmission:0.08, side:THREE.DoubleSide, depthWrite:false}))
water.rotation.x = -Math.PI/2
water.position.y = 0
scene.add(water)

const boundaryPoints = []
for (let i=-55;i<=55;i+=2) boundaryPoints.push(new THREE.Vector3(i, seabedBase-0.15, 9-i*0.28))
const boundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(boundaryPoints), new THREE.LineBasicMaterial({color:0xffb257, transparent:true, opacity:0.8}))
scene.add(boundary)

const quakeGroup = new THREE.Group()
const quakePositions = [
  [-42,-7.4,20],[-33,-8.2,18],[-24,-9.0,16],[-16,-9.8,14],[-8,-10.7,12],[0,-11.2,9],
  [10,-10.0,7],[19,-9.1,5],[28,-8.5,2],[37,-8.1,-2],[46,-7.7,-5],[-5,-8.6,17],[17,-8.4,11]
]
const qGeo = new THREE.SphereGeometry(.35,10,8)
const qMat = new THREE.MeshBasicMaterial({color:0xff6c77})
for (const [x,y,z] of quakePositions) { const q=new THREE.Mesh(qGeo,qMat); q.position.set(x,y,z); quakeGroup.add(q) }
scene.add(quakeGroup)

const researchObjects = []
let selected = null
let pairSeq = 1
let gridMesh = null

function frustumGeometry(base, top, height, downward=false) {
  const b=base/2, t=top/2, y=downward ? -height : height
  const vertices = new Float32Array([
    -b,0,-b, b,0,-b, b,0,b, -b,0,b,
    -t,y,-t, t,y,-t, t,y,t, -t,y,t
  ])
  const indices = [0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(vertices,3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function volume(base, top, h) {
  const a1=base*base, a2=top*top
  return h/3*(a1+a2+Math.sqrt(a1*a2))
}

function params() {
  return {base:Number($('#baseSize').value), top:Number($('#topSize').value), height:Number($('#heightSize').value)}
}

function positionFor(type, offset=0) {
  const n=researchObjects.length
  const angle=(n*2.399 + offset)%(Math.PI*2)
  const radius=14 + (n%4)*7
  const x=Math.cos(angle)*radius
  const z=Math.sin(angle)*radius - 9
  return new THREE.Vector3(x,seabedBase+0.45,z)
}

function addFeature(type, options={}) {
  const cfg=params()
  if (cfg.top >= cfg.base) {
    setMessage('Szczyt/dno plateau musi być mniejsze od podstawy.')
    return null
  }
  const downward=type==='trench'
  const geometry=frustumGeometry(cfg.base,cfg.top,cfg.height,downward)
  const material=new THREE.MeshStandardMaterial({
    color: downward ? 0x6d58b8 : 0x3da97a,
    roughness:.82,
    metalness:.03,
    transparent:downward,
    opacity:downward?.68:1,
    side:THREE.DoubleSide
  })
  const mesh=new THREE.Mesh(geometry,material)
  mesh.castShadow=!downward
  mesh.receiveShadow=true
  mesh.position.copy(options.position || positionFor(type, downward ? 1.1:0))
  mesh.userData={kind:type, volume:volume(cfg.base,cfg.top,cfg.height), pairId:options.pairId || null, base:cfg.base, top:cfg.top, height:cfg.height}
  scene.add(mesh)
  researchObjects.push(mesh)
  select(mesh)
  updateMetrics()
  return mesh
}

function addPair() {
  const id=`P${pairSeq++}`
  const cfg=params()
  const anchor=positionFor('pair')
  const mountain=addFeature('mountain',{pairId:id,position:anchor.clone().add(new THREE.Vector3(-cfg.base*.65,0,0))})
  const trench=addFeature('trench',{pairId:id,position:anchor.clone().add(new THREE.Vector3(cfg.base*.65,0,0))})
  if (mountain && trench) setMessage(`Dodano parę ${id}: identyczna objętość góry i rowu w scenie numerycznej.`)
}

function select(mesh) {
  if (selected?.material?.emissive) selected.material.emissive.setHex(0x000000)
  selected=mesh
  if (selected?.material?.emissive) selected.material.emissive.setHex(0x164153)
  const label=selected ? `${selected.userData.kind==='mountain'?'góra':'rów'} · ${selected.userData.volume.toFixed(1)} km³${selected.userData.pairId?` · ${selected.userData.pairId}`:''}` : 'brak'
  $('#selectionHud').textContent=`Zaznaczenie: ${label}`
}

function removeSelected() {
  if (!selected) return setMessage('Najpierw kliknij górę lub rów w scenie.')
  const idx=researchObjects.indexOf(selected)
  if (idx>=0) researchObjects.splice(idx,1)
  scene.remove(selected)
  selected.geometry.dispose(); selected.material.dispose()
  selected=null
  $('#selectionHud').textContent='Zaznaczenie: brak'
  updateMetrics(); setMessage('Usunięto tylko obiekt z symulacji. Dane źródłowe nie są modyfikowane.')
}

function resetScene() {
  for (const obj of [...researchObjects]) { scene.remove(obj); obj.geometry.dispose(); obj.material.dispose() }
  researchObjects.length=0; selected=null; pairSeq=1
  $('#selectionHud').textContent='Zaznaczenie: brak'
  updateMetrics(); setMessage('Scena proceduralna zresetowana.')
}

function toggleGrid() {
  if (gridMesh) {
    scene.remove(gridMesh); gridMesh.geometry.dispose(); gridMesh.material.dispose(); gridMesh=null
    $('#grid512').textContent='Włącz siatkę 8×8×8 = 512'
    return
  }
  const g=new THREE.BoxGeometry(1.35,.12,1.35)
  const m=new THREE.MeshBasicMaterial({color:0x65dfff,transparent:true,opacity:.22})
  gridMesh=new THREE.InstancedMesh(g,m,512)
  const dummy=new THREE.Object3D(); let i=0
  for(let y=0;y<8;y++) for(let z=0;z<8;z++) for(let x=0;x<8;x++) {
    dummy.position.set((x-3.5)*2.1,seabedBase-9+(y-3.5)*1.6,(z-3.5)*2.1+25)
    dummy.rotation.set(0,0,0); dummy.updateMatrix(); gridMesh.setMatrixAt(i++,dummy.matrix)
  }
  gridMesh.instanceMatrix.needsUpdate=true
  scene.add(gridMesh)
  $('#grid512').textContent='Wyłącz siatkę 8×8×8 = 512'
  setMessage('512 komórek jest renderowanych przez GPU Instancing. To siatka badawcza, nie 512 fizycznych obiektów na dnie.')
}

function updateMetrics() {
  const mountains=researchObjects.filter(o=>o.userData.kind==='mountain')
  const trenches=researchObjects.filter(o=>o.userData.kind==='trench')
  const mv=mountains.reduce((s,o)=>s+o.userData.volume,0)
  const tv=trenches.reduce((s,o)=>s+o.userData.volume,0)
  const pairs=new Set(researchObjects.map(o=>o.userData.pairId).filter(Boolean))
  $('#mountainCount').textContent=String(mountains.length)
  $('#trenchCount').textContent=String(trenches.length)
  $('#pairCount').textContent=String(pairs.size)
  $('#materialBalance').textContent=`${(tv-mv).toFixed(1)} km³`
  const proxy=(Math.abs(tv-mv)/(1+tv+mv))*100
  $('#massProxy').textContent=`${proxy.toFixed(2)}%`
}

function updateParameterReadouts() {
  const cfg=params()
  $('#baseOut').textContent=`${cfg.base.toFixed(1)} km`
  $('#topOut').textContent=`${cfg.top.toFixed(1)} km`
  $('#heightOut').textContent=`${cfg.height.toFixed(1)} km`
  $('#volumeOut').textContent=`${volume(cfg.base,cfg.top,cfg.height).toFixed(1)} km³`
}

function setMessage(text){ $('#actionMessage').textContent=text }

$('#addMountain').addEventListener('click',()=>{ const x=addFeature('mountain'); if(x)setMessage('Dodano podwodną górę do sceny badawczej.') })
$('#addTrench').addEventListener('click',()=>{ const x=addFeature('trench'); if(x)setMessage('Dodano dolinę/rów do sceny badawczej. Nie jest to instrukcja realnego pogłębiania.') })
$('#addPair').addEventListener('click',addPair)
$('#removeSelected').addEventListener('click',removeSelected)
$('#resetScene').addEventListener('click',resetScene)
$('#grid512').addEventListener('click',toggleGrid)
for (const id of ['baseSize','topSize','heightSize']) $('#'+id).addEventListener('input',updateParameterReadouts)

$('#showWater').addEventListener('change',e=>{water.visible=e.target.checked})
$('#showBoundary').addEventListener('change',e=>{boundary.visible=e.target.checked;quakeGroup.visible=e.target.checked})
$('#verticalExaggeration').addEventListener('input',e=>{
  const factor=Number(e.target.value)
  $('#verticalOut').textContent=`${factor.toFixed(1)}×`
  seabed.scale.y=factor
  for(const obj of researchObjects) obj.scale.y=factor
  setMessage('Przewyższenie pionowe zmienia wyłącznie wizualizację, nie geometrię danych ani obliczoną objętość.')
})

const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown',event=>{
  const r=renderer.domElement.getBoundingClientRect()
  pointer.x=((event.clientX-r.left)/r.width)*2-1
  pointer.y=-((event.clientY-r.top)/r.height)*2+1
  raycaster.setFromCamera(pointer,camera)
  const hit=raycaster.intersectObjects(researchObjects,false)[0]
  if(hit) select(hit.object)
})

function resize(){
  const w=viewer.clientWidth,h=viewer.clientHeight
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()
}
window.addEventListener('resize',resize);resize()

let last=0
function animate(t){
  requestAnimationFrame(animate)
  controls.update()
  water.material.opacity=.25+.035*Math.sin(t*.00065)
  if(gridMesh) gridMesh.rotation.y=Math.sin(t*.00015)*.08
  renderer.render(scene,camera)
  last=t
}

updateParameterReadouts();updateMetrics();addPair();animate(0)

fetch('./research-registry.json',{cache:'no-store'})
  .then(r=>r.ok?r.json():Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(data=>{
    $('#registryStatus').textContent=`Rejestr badawczy: ${data.sources.length} zweryfikowanych źródeł · aktualizacja ${data.updated_utc}`
  })
  .catch(err=>{$('#registryStatus').textContent=`Rejestr badawczy niedostępny: ${String(err)}`})
