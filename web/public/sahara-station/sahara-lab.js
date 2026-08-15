import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = (id) => document.getElementById(id);
const fmt = (n, digits = 2) => Number(n).toLocaleString('pl-PL', { maximumFractionDigits: digits });
const WORLD = 58;
const TERRAIN_SIZE = 120;
const TERRAIN_SEGMENTS = 150;
const objects = [];
let selected = null;
let nextId = 1;
let transformDragging = false;
let channelEnabled = true;

function currentShape() {
  const base = Math.max(0.5, Number($('baseSize').value));
  const top = Math.min(base - 0.1, Math.max(0.2, Number($('topSize').value)));
  const height = Math.max(0.1, Number($('heightSize').value));
  return { base, top, height, volume: frustumVolume(base, top, height) };
}

function frustumVolume(base, top, height) {
  return height / 3 * (base * base + base * top + top * top);
}

function setMessage(text, kind = '') {
  const el = $('actionMessage');
  el.textContent = text;
  el.className = `action-message ${kind}`.trim();
}

const viewer = $('viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc97d3d);
scene.fog = new THREE.Fog(0xc47a3b, 48, 118);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 260);
camera.position.set(31, 25, 38);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, -1, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.minDistance = 8;
orbit.maxDistance = 95;
orbit.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffe0a7, 0x4b2915, 1.55));
const sun = new THREE.DirectionalLight(0xfff2d2, 3.25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -52;
sun.shadow.camera.right = 52;
sun.shadow.camera.top = 52;
sun.shadow.camera.bottom = -52;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.00035;
scene.add(sun);
scene.add(sun.target);

const terrainGeometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
terrainGeometry.rotateX(-Math.PI / 2);
const terrainMaterial = new THREE.MeshStandardMaterial({ color: 0xc98943, roughness: 0.98, metalness: 0.0 });
const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = true;
scene.add(terrain);

const grid = new THREE.GridHelper(100, 20, 0x6f4f30, 0x6f4f30);
grid.position.y = 0.22;
grid.material.transparent = true;
grid.material.opacity = 0.22;
grid.visible = false;
scene.add(grid);

const channelLineMaterial = new THREE.LineBasicMaterial({ color: 0x6f3d22, transparent: true, opacity: 0.95 });
const channelPoints2D = [
  [-51, -22], [-44, -17], [-38, -19], [-31, -12], [-24, -9], [-18, -12], [-12, -5],
  [-6, -2], [0, -5], [6, 1], [12, 5], [18, 3], [24, 10], [31, 12], [38, 18], [48, 22]
];
const channelCurve = new THREE.CatmullRomCurve3(channelPoints2D.map(([x, z]) => new THREE.Vector3(x, 0.24, z)), false, 'catmullrom', 0.25);
const channelVisual = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(channelCurve.getPoints(220)),
  channelLineMaterial
);
scene.add(channelVisual);

const channelBranch = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-16, 0.23, -11), new THREE.Vector3(-11, 0.23, -18), new THREE.Vector3(-4, 0.23, -23), new THREE.Vector3(4, 0.23, -26)
  ]).getPoints(70)),
  new THREE.LineBasicMaterial({ color: 0x7b4526, transparent: true, opacity: 0.75 })
);
scene.add(channelBranch);

function baseTerrainHeight(x, z) {
  const waves = Math.sin(x * 0.105) * 0.26 + Math.cos(z * 0.087) * 0.22 + Math.sin((x + z) * 0.052) * 0.18;
  const dunes = Math.sin((x * 0.17) + Math.cos(z * 0.055) * 1.8) * 0.13;
  const channel = channelEnabled ? channelDepression(x, z) : 0;
  return waves + dunes + channel;
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const denom = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / denom));
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

function channelDepression(x, z) {
  let min = Infinity;
  for (let i = 0; i < channelPoints2D.length - 1; i++) {
    const [ax, az] = channelPoints2D[i];
    const [bx, bz] = channelPoints2D[i + 1];
    min = Math.min(min, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  const width = 1.65;
  if (min >= width) return 0;
  const q = 1 - min / width;
  return -0.42 * q * q;
}

function valleyOffsetAt(x, z, object) {
  const { base, top, height } = object.userData.shape;
  const dx = Math.abs(x - object.position.x);
  const dz = Math.abs(z - object.position.z);
  const r = Math.max(dx, dz);
  const outer = base / 2;
  const inner = Math.min(top / 2, outer - 0.01);
  if (r >= outer) return 0;
  if (r <= inner) return -height;
  const t = (r - inner) / Math.max(0.01, outer - inner);
  return -height * (1 - t);
}

function terrainHeightAt(x, z) {
  let y = baseTerrainHeight(x, z);
  for (const object of objects) {
    if (object.userData.kind !== 'valley') continue;
    const offset = valleyOffsetAt(x, z, object);
    if (offset < 0) y = Math.min(y, baseTerrainHeight(x, z) + offset);
  }
  return y;
}

function updateTerrain() {
  const pos = terrainGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeightAt(x, z));
  }
  pos.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  updateObjectGrounding();
}

function materialFor(kind) {
  if (kind === 'mountain') {
    return new THREE.MeshStandardMaterial({ color: 0xa86631, roughness: 0.94, metalness: 0, emissive: 0x000000 });
  }
  return new THREE.MeshStandardMaterial({ color: 0x6d3c21, roughness: 1, metalness: 0, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
}

function createMountain(shape, x, z, options = {}) {
  const group = new THREE.Group();
  const geom = new THREE.CylinderGeometry(shape.top / Math.SQRT2, shape.base / Math.SQRT2, shape.height, 4, 1, false);
  const mesh = new THREE.Mesh(geom, materialFor('mountain'));
  mesh.rotation.y = Math.PI / 4;
  mesh.position.y = shape.height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(shape.top / Math.SQRT2, shape.top / Math.SQRT2, 0.08, 4),
    new THREE.MeshStandardMaterial({ color: 0xc98a4d, roughness: 0.92, emissive: 0x000000 })
  );
  cap.rotation.y = Math.PI / 4;
  cap.position.y = shape.height + 0.04;
  cap.castShadow = true;
  group.add(cap);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0xffd28f, transparent: true, opacity: 0 })
  );
  edges.rotation.y = Math.PI / 4;
  edges.position.y = shape.height / 2;
  group.add(edges);

  group.position.set(x, baseTerrainHeight(x, z), z);
  group.userData = {
    id: nextId++, kind: 'mountain', shape: { ...shape }, volume: shape.volume,
    mesh, cap, edges, pair: options.pair || null
  };
  mesh.userData.owner = group;
  cap.userData.owner = group;
  scene.add(group);
  objects.push(group);
  return group;
}

function createValley(shape, x, z, options = {}) {
  const group = new THREE.Group();
  const pickerGeom = new THREE.CylinderGeometry(shape.base / Math.SQRT2, shape.top / Math.SQRT2, shape.height, 4, 1, true);
  const picker = new THREE.Mesh(pickerGeom, materialFor('valley'));
  picker.rotation.y = Math.PI / 4;
  picker.position.y = -shape.height / 2;
  picker.userData.owner = group;
  group.add(picker);

  const rimGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-shape.base / 2, 0.08, -shape.base / 2),
    new THREE.Vector3(shape.base / 2, 0.08, -shape.base / 2),
    new THREE.Vector3(shape.base / 2, 0.08, shape.base / 2),
    new THREE.Vector3(-shape.base / 2, 0.08, shape.base / 2),
    new THREE.Vector3(-shape.base / 2, 0.08, -shape.base / 2)
  ]);
  const rim = new THREE.Line(rimGeom, new THREE.LineBasicMaterial({ color: 0xffc47a, transparent: true, opacity: 0.34 }));
  group.add(rim);

  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(shape.top / Math.SQRT2, shape.top / Math.SQRT2, 0.04, 4),
    new THREE.MeshStandardMaterial({ color: 0x764526, roughness: 1 })
  );
  bottom.rotation.y = Math.PI / 4;
  bottom.position.y = -shape.height + 0.02;
  bottom.receiveShadow = true;
  group.add(bottom);

  group.position.set(x, baseTerrainHeight(x, z), z);
  group.userData = {
    id: nextId++, kind: 'valley', shape: { ...shape }, volume: shape.volume,
    picker, rim, bottom, pair: options.pair || null
  };
  scene.add(group);
  objects.push(group);
  updateTerrain();
  return group;
}

function createResearchStation() {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xe4ded1, roughness: 0.55, metalness: 0.18 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x252a2c, roughness: 0.42, metalness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x72c9d4, roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.72 });

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.1, 0.3, 12), darkMat);
  platform.position.y = 0.18;
  platform.castShadow = true; platform.receiveShadow = true; group.add(platform);

  for (const [x, z, r] of [[0, 0, 1.35], [2.0, 0.4, 0.8], [-1.8, 0.7, 0.75]]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    dome.position.set(x, 0.32, z); dome.castShadow = true; group.add(dome);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.8, 10), baseMat);
  mast.position.set(-0.4, 2.2, -1.4); mast.castShadow = true; group.add(mast);
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), baseMat);
  sensor.position.set(-0.4, 4.1, -1.4); sensor.castShadow = true; group.add(sensor);

  for (const x of [-2.8, -1.4, 1.4, 2.8]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 2.0), new THREE.MeshStandardMaterial({ color: 0x172d39, roughness: 0.32, metalness: 0.45 }));
    panel.position.set(x, 0.72, -3.0);
    panel.rotation.x = -0.28;
    panel.castShadow = true;
    group.add(panel);
  }
  group.position.set(-20, baseTerrainHeight(-20, -18), -18);
  scene.add(group);
  return group;
}

const researchStation = createResearchStation();

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode('translate');
transform.setSize(0.9);
transform.showY = false;
scene.add(transform.getHelper());
transform.addEventListener('dragging-changed', (event) => {
  transformDragging = event.value;
  orbit.enabled = !event.value;
});
transform.addEventListener('objectChange', () => {
  if (!selected) return;
  selected.position.x = THREE.MathUtils.clamp(selected.position.x, -WORLD + 6, WORLD - 6);
  selected.position.z = THREE.MathUtils.clamp(selected.position.z, -WORLD + 6, WORLD - 6);
  if (selected.userData.kind === 'mountain') {
    selected.position.y = baseTerrainHeight(selected.position.x, selected.position.z);
  } else {
    selected.position.y = baseTerrainHeight(selected.position.x, selected.position.z);
    updateTerrain();
  }
  updateSelectionHud();
});

function updateObjectGrounding() {
  for (const object of objects) {
    if (object.userData.kind === 'mountain') {
      object.position.y = terrainHeightAt(object.position.x, object.position.z);
    } else {
      object.position.y = baseTerrainHeight(object.position.x, object.position.z);
    }
  }
  researchStation.position.y = terrainHeightAt(researchStation.position.x, researchStation.position.z);
}

function updateSun() {
  const az = Number($('sunAzimuth').value);
  const el = Number($('sunElevation').value);
  $('sunAzOut').textContent = `${fmt(az, 0)}°`;
  $('sunElOut').textContent = `${fmt(el, 0)}°`;
  const azr = THREE.MathUtils.degToRad(az);
  const elr = THREE.MathUtils.degToRad(el);
  const radius = 72;
  const horizontal = Math.cos(elr) * radius;
  sun.position.set(Math.sin(azr) * horizontal, Math.sin(elr) * radius, Math.cos(azr) * horizontal);
  sun.target.position.set(0, 0, 0);
}

function totals() {
  let excavated = 0;
  let used = 0;
  let mountains = 0;
  let valleys = 0;
  for (const object of objects) {
    if (object.userData.kind === 'valley') { excavated += object.userData.volume; valleys++; }
    else if (object.userData.kind === 'mountain') { used += object.userData.volume; mountains++; }
  }
  return { excavated, used, bank: excavated - used, mountains, valleys };
}

function updateMetrics() {
  const t = totals();
  $('mountainCount').textContent = t.mountains;
  $('valleyCount').textContent = t.valleys;
  $('excavatedTotal').textContent = `${fmt(t.excavated)} km³`;
  $('usedTotal').textContent = `${fmt(t.used)} km³`;
  $('materialBank').textContent = `${fmt(t.bank)} km³`;
  $('materialBank').style.color = t.bank < -0.001 ? '#ff9a72' : '#96edb2';
  $('buildMountain').disabled = t.bank + 1e-6 < currentShape().volume;
}

function updateShapeOutputs() {
  const shape = currentShape();
  if (Number($('topSize').value) >= shape.base) {
    $('topSize').value = Math.max(0.5, shape.base - 0.25);
    return updateShapeOutputs();
  }
  $('baseOut').textContent = `${fmt(shape.base, 2)} km`;
  $('topOut').textContent = `${fmt(shape.top, 2)} km`;
  $('heightOut').textContent = `${fmt(shape.height, 2)} km`;
  $('newVolume').textContent = `${fmt(shape.volume)} km³`;
  updateMetrics();
}

function randomPlacement(sign = 1) {
  const jitter = () => (Math.random() - 0.5) * 24;
  return { x: sign * (10 + Math.random() * 18), z: jitter() };
}

function digValley(shape = currentShape(), at = null) {
  const p = at || randomPlacement(1);
  const valley = createValley(shape, p.x, p.z);
  updateMetrics();
  setMessage(`Wykopano dolinę ${valley.userData.id}. Do banku dodano ${fmt(shape.volume)} km³ materiału.`, 'ok');
  selectObject(valley);
  return valley;
}

function buildMountain(shape = currentShape(), at = null, bypass = false) {
  const t = totals();
  if (!bypass && t.bank + 1e-6 < shape.volume) {
    setMessage(`Za mało materiału. Potrzeba ${fmt(shape.volume)} km³, a dostępne jest ${fmt(Math.max(0, t.bank))} km³. Najpierw wykop dolinę.`, 'error');
    return null;
  }
  const p = at || randomPlacement(-1);
  const mountain = createMountain(shape, p.x, p.z);
  updateMetrics();
  setMessage(`Zbudowano górę ${mountain.userData.id}. Zużyto ${fmt(shape.volume)} km³ materiału.`, 'ok');
  selectObject(mountain);
  return mountain;
}

function duplicateSelected() {
  if (!selected) return setMessage('Najpierw zaznacz górę albo dolinę.', 'error');
  const shape = { ...selected.userData.shape, volume: selected.userData.volume };
  const p = { x: THREE.MathUtils.clamp(selected.position.x + 7, -WORLD + 6, WORLD - 6), z: THREE.MathUtils.clamp(selected.position.z + 5, -WORLD + 6, WORLD - 6) };
  if (selected.userData.kind === 'valley') digValley(shape, p);
  else buildMountain(shape, p);
}

function deleteSelected() {
  if (!selected) return setMessage('Najpierw zaznacz obiekt do usunięcia.', 'error');
  const object = selected;
  if (object.userData.kind === 'valley') {
    const afterBank = totals().bank - object.userData.volume;
    if (afterBank < -1e-6) {
      setMessage('Nie można usunąć tej doliny: pozostałe góry zużywają materiał, który pochodzi z tego wykopu. Najpierw usuń odpowiednią górę.', 'error');
      return;
    }
  }
  clearSelection();
  scene.remove(object);
  const index = objects.indexOf(object);
  if (index >= 0) objects.splice(index, 1);
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => mat.dispose());
    }
  });
  if (object.userData.kind === 'valley') updateTerrain();
  updateMetrics();
  setMessage(`Usunięto ${object.userData.kind === 'valley' ? 'dolinę' : 'górę'} ${object.userData.id}.`, 'ok');
}

function highlight(object, on) {
  if (!object) return;
  if (object.userData.kind === 'mountain') {
    object.userData.mesh.material.emissive.setHex(on ? 0x3a2200 : 0x000000);
    object.userData.cap.material.emissive.setHex(on ? 0x3a2200 : 0x000000);
    object.userData.edges.material.opacity = on ? 0.95 : 0;
  } else {
    object.userData.rim.material.color.setHex(on ? 0xfff0b4 : 0xffc47a);
    object.userData.rim.material.opacity = on ? 1 : 0.34;
    object.userData.picker.material.opacity = on ? 0.10 : 0.05;
  }
}

function selectObject(object) {
  if (selected === object) return;
  highlight(selected, false);
  selected = object;
  if (selected) {
    highlight(selected, true);
    transform.attach(selected);
  } else {
    transform.detach();
  }
  updateSelectionHud();
}

function clearSelection() { selectObject(null); }

function updateSelectionHud() {
  if (!selected) {
    $('selectionHud').textContent = 'Zaznaczenie: brak';
    return;
  }
  const kind = selected.userData.kind === 'mountain' ? 'góra' : 'dolina';
  $('selectionHud').textContent = `Zaznaczenie: ${kind} #${selected.userData.id} • ${fmt(selected.userData.volume)} km³ • X ${fmt(selected.position.x, 1)} km • Z ${fmt(selected.position.z, 1)} km`;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (transformDragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const pickables = [];
  for (const object of objects) {
    object.traverse((child) => { if (child.isMesh && child.userData.owner) pickables.push(child); });
  }
  const hits = raycaster.intersectObjects(pickables, false);
  if (hits.length) selectObject(hits[0].object.userData.owner);
});

function clearObjects() {
  clearSelection();
  while (objects.length) {
    const object = objects.pop();
    scene.remove(object);
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => mat.dispose());
      }
    });
  }
}

function resetDemo() {
  clearObjects();
  nextId = 1;
  const shape = { base: 8, top: 2, height: 2.5, volume: frustumVolume(8, 2, 2.5) };
  createValley(shape, 13, 7, { pair: 'demo' });
  createMountain(shape, -5, 6, { pair: 'demo' });
  const small = { base: 5, top: 1.5, height: 1.5, volume: frustumVolume(5, 1.5, 1.5) };
  createValley(small, 26, -14, { pair: 'demo-2' });
  updateTerrain();
  updateMetrics();
  clearSelection();
  setMessage('Scena demonstracyjna zresetowana. Bilans zawiera dodatkową dolinę, więc masz materiał na kolejną mniejszą górę.', 'ok');
}

function resize() {
  const w = viewer.clientWidth;
  const h = viewer.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

['baseSize', 'topSize', 'heightSize'].forEach((id) => $(id).addEventListener('input', updateShapeOutputs));
$('digValley').addEventListener('click', () => digValley());
$('buildMountain').addEventListener('click', () => buildMountain());
$('duplicateSelected').addEventListener('click', duplicateSelected);
$('deleteSelected').addEventListener('click', deleteSelected);
$('sunAzimuth').addEventListener('input', updateSun);
$('sunElevation').addEventListener('input', updateSun);
$('showChannel').addEventListener('change', (event) => {
  channelEnabled = event.target.checked;
  channelVisual.visible = channelEnabled;
  channelBranch.visible = channelEnabled;
  updateTerrain();
});
$('showGrid').addEventListener('change', (event) => { grid.visible = event.target.checked; });
$('resetScene').addEventListener('click', resetDemo);
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(viewer);

updateShapeOutputs();
updateSun();
resetDemo();
resize();
animate();
