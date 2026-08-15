import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = (id) => document.getElementById(id);
const fmt = (n, digits = 2) => Number(n).toLocaleString('pl-PL', { maximumFractionDigits: digits });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const WORLD = 58;
const TERRAIN_SIZE = 120;
const TERRAIN_SEGMENTS = 150;
const SITE = { lat: 23.515002, lon: 11.998501, x: 0, z: 0 };
const objects = [];
const trees = [];
let selected = null;
let nextId = 1;
let transformDragging = false;
let channelEnabled = true;
let plantingMode = false;
let scenarioStage = 0;

function currentShape() {
  const base = Math.max(0.5, Number($('baseSize').value));
  const top = Math.min(base - 0.1, Math.max(0.2, Number($('topSize').value)));
  const height = Math.max(0.1, Number($('heightSize').value));
  return { base, top, height, volume: frustumVolume(base, top, height) };
}

function frustumVolume(base, top, height) {
  return height / 3 * (base * base + base * top + top * top);
}

function sameShape(a, b) {
  return Math.abs(a.base - b.base) < 1e-6 && Math.abs(a.top - b.top) < 1e-6 && Math.abs(a.height - b.height) < 1e-6;
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
scene.fog = new THREE.Fog(0xc47a3b, 52, 120);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 260);
camera.position.set(31, 25, 38);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, -1, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.minDistance = 7;
orbit.maxDistance = 98;
orbit.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffe0a7, 0x4b2915, 1.55));
const sun = new THREE.DirectionalLight(0xfff2d2, 3.25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -58;
sun.shadow.camera.right = 58;
sun.shadow.camera.top = 58;
sun.shadow.camera.bottom = -58;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 165;
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

const channelPoints2D = [
  [-51, -22], [-44, -17], [-38, -19], [-31, -12], [-24, -9], [-18, -12], [-12, -5],
  [-6, -2], [0, -5], [6, 1], [12, 5], [18, 3], [24, 10], [31, 12], [38, 18], [48, 22]
];
const channelCurve = new THREE.CatmullRomCurve3(channelPoints2D.map(([x, z]) => new THREE.Vector3(x, 0.24, z)), false, 'catmullrom', 0.25);
const channelVisual = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(channelCurve.getPoints(220)),
  new THREE.LineBasicMaterial({ color: 0x6f3d22, transparent: true, opacity: 0.95 })
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
  updateHostedTrees();
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

  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData = {
    id: nextId++, kind: 'mountain', shape: { ...shape }, volume: shape.volume,
    mesh, cap, edges, pairedWith: options.pairedWith || null, site: Boolean(options.site)
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

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(shape.top / Math.SQRT2, shape.top / Math.SQRT2, 0.015, 4),
    new THREE.MeshStandardMaterial({ color: 0x287da3, roughness: 0.16, metalness: 0.03, transparent: true, opacity: 0.58 })
  );
  water.rotation.y = Math.PI / 4;
  water.position.y = -shape.height + 0.07;
  water.visible = false;
  group.add(water);

  group.position.set(x, baseTerrainHeight(x, z), z);
  group.userData = {
    id: nextId++, kind: 'valley', shape: { ...shape }, volume: shape.volume,
    picker, rim, bottom, water, pairedWith: options.pairedWith || null, waterFraction: 0
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
  platform.position.y = 0.18; platform.castShadow = true; platform.receiveShadow = true; group.add(platform);
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
    panel.position.set(x, 0.72, -3.0); panel.rotation.x = -0.28; panel.castShadow = true; group.add(panel);
  }
  group.position.set(-22, baseTerrainHeight(-22, -18), -18);
  scene.add(group);
  return group;
}

const researchStation = createResearchStation();

const siteBeacon = new THREE.Group();
const siteRing = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: 0xff544d }));
siteRing.rotation.x = Math.PI / 2; siteRing.position.y = 0.28; siteBeacon.add(siteRing);
const sitePole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.5, 8), new THREE.MeshBasicMaterial({ color: 0xff6a61 }));
sitePole.position.y = 2.25; siteBeacon.add(sitePole);
siteBeacon.position.set(SITE.x, baseTerrainHeight(SITE.x, SITE.z), SITE.z);
scene.add(siteBeacon);

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
  if (selected.userData.kind === 'mountain') selected.position.y = terrainHeightAt(selected.position.x, selected.position.z);
  else { selected.position.y = baseTerrainHeight(selected.position.x, selected.position.z); updateTerrain(); }
  updateHostedTrees();
  updateSelectionHud();
});

function updateObjectGrounding() {
  for (const object of objects) {
    object.position.y = object.userData.kind === 'mountain'
      ? terrainHeightAt(object.position.x, object.position.z)
      : baseTerrainHeight(object.position.x, object.position.z);
  }
  researchStation.position.y = terrainHeightAt(researchStation.position.x, researchStation.position.z);
  siteBeacon.position.y = baseTerrainHeight(SITE.x, SITE.z);
}

function updateSun() {
  const az = Number($('sunAzimuth').value);
  const el = Number($('sunElevation').value);
  $('sunAzOut').textContent = `${fmt(az, 0)}°`;
  $('sunElOut').textContent = `${fmt(el, 0)}°`;
  $('shadowDirection').textContent = `${fmt((az + 180) % 360, 0)}°`;
  const azr = THREE.MathUtils.degToRad(az);
  const elr = THREE.MathUtils.degToRad(el);
  const radius = 72;
  const horizontal = Math.cos(elr) * radius;
  sun.position.set(Math.sin(azr) * horizontal, Math.sin(elr) * radius, Math.cos(azr) * horizontal);
  sun.target.position.set(0, 0, 0);
  updateShadowReadout();
  updateWaterAndVegetation();
}

function totals() {
  let excavated = 0;
  let used = 0;
  let mountains = 0;
  let valleys = 0;
  let pairs = 0;
  for (const object of objects) {
    if (object.userData.kind === 'valley') { excavated += object.userData.volume; valleys++; if (object.userData.pairedWith) pairs++; }
    else if (object.userData.kind === 'mountain') { used += object.userData.volume; mountains++; }
  }
  return { excavated, used, bank: excavated - used, mountains, valleys, pairs };
}

function scenarioRetention() {
  const t = totals();
  const rain = Number($('rainScenario').value) / 100;
  const network = clamp(t.pairs / 12, 0, 1);
  const stage = clamp(scenarioStage / 10, 0, 1);
  return clamp(rain * 0.28 + network * 0.42 + stage * 0.30, 0, 1);
}

function updateMetrics() {
  const t = totals();
  $('mountainCount').textContent = t.mountains;
  $('valleyCount').textContent = t.valleys;
  $('pairedCount').textContent = t.pairs;
  $('excavatedTotal').textContent = `${fmt(t.excavated)} km³`;
  $('usedTotal').textContent = `${fmt(t.used)} km³`;
  $('materialBank').textContent = `${fmt(t.bank)} km³`;
  $('materialBank').style.color = t.bank < -0.001 ? '#ff9a72' : '#96edb2';
  $('buildMountain').disabled = !findUnpairedValleyForShape(currentShape());
  $('treeCount').textContent = trees.length.toLocaleString('pl-PL');
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
  const jitter = () => (Math.random() - 0.5) * 30;
  return { x: sign * (10 + Math.random() * 22), z: jitter() };
}

function findObjectById(id) { return objects.find((o) => o.userData.id === id) || null; }
function findUnpairedValleyForShape(shape) {
  return objects.find((o) => o.userData.kind === 'valley' && !o.userData.pairedWith && sameShape(o.userData.shape, shape)) || null;
}

function digValley(shape = currentShape(), at = null) {
  const p = at || randomPlacement(1);
  const valley = createValley(shape, p.x, p.z);
  updateMetrics(); updateWaterAndVegetation();
  setMessage(`Wykopano dolinę #${valley.userData.id}. Jest gotowa jako źródło ${fmt(shape.volume)} km³ materiału dla jednej zgodnej góry.`, 'ok');
  selectObject(valley);
  return valley;
}

function buildMountain(shape = currentShape(), at = null, options = {}) {
  const sourceValley = options.sourceValley || findUnpairedValleyForShape(shape);
  if (!sourceValley) {
    setMessage(`Brak wolnej doliny 1:1 dla tej geometrii. Potrzeba doliny ${fmt(shape.base,1)} × ${fmt(shape.base,1)} km, plateau ${fmt(shape.top,1)} km i głębokości ${fmt(shape.height,1)} km. Najpierw wykop dolinę.`, 'error');
    return null;
  }
  const p = at || randomPlacement(-1);
  const mountain = createMountain(shape, p.x, p.z, { pairedWith: sourceValley.userData.id, site: Boolean(options.site) });
  sourceValley.userData.pairedWith = mountain.userData.id;
  updateMetrics(); updateWaterAndVegetation();
  setMessage(`Zbudowano górę #${mountain.userData.id} z materiału doliny #${sourceValley.userData.id}. Para 1:1 została zamknięta.`, 'ok');
  selectObject(mountain);
  return mountain;
}

function createPair(shape = currentShape(), near = null) {
  const center = near || randomPlacement(1);
  const valleyAt = { x: clamp(center.x + 6, -WORLD + 8, WORLD - 8), z: clamp(center.z + 5, -WORLD + 8, WORLD - 8) };
  const mountainAt = { x: clamp(center.x - 7, -WORLD + 8, WORLD - 8), z: clamp(center.z - 5, -WORLD + 8, WORLD - 8) };
  const valley = digValley(shape, valleyAt);
  const mountain = buildMountain(shape, mountainAt, { sourceValley: valley });
  return { valley, mountain };
}

function duplicateSelected() {
  if (!selected) return setMessage('Najpierw zaznacz górę albo dolinę.', 'error');
  const shape = { ...selected.userData.shape, volume: selected.userData.volume };
  createPair(shape, { x: clamp(selected.position.x + 12, -WORLD + 10, WORLD - 10), z: clamp(selected.position.z + 8, -WORLD + 10, WORLD - 10) });
  setMessage('Powielono pełną parę 1:1: najpierw nowa dolina, następnie nowa góra z jej materiału.', 'ok');
}

function deleteSelected() {
  if (!selected) return setMessage('Najpierw zaznacz obiekt do usunięcia.', 'error');
  const object = selected;
  if (object.userData.kind === 'valley' && object.userData.pairedWith) {
    setMessage(`Nie można usunąć doliny #${object.userData.id}: zasila górę #${object.userData.pairedWith}. Najpierw usuń tę górę.`, 'error');
    return;
  }
  if (object.userData.kind === 'mountain' && object.userData.pairedWith) {
    const valley = findObjectById(object.userData.pairedWith);
    if (valley) valley.userData.pairedWith = null;
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
  updateMetrics(); updateWaterAndVegetation();
  setMessage(`Usunięto ${object.userData.kind === 'valley' ? 'dolinę' : 'górę'} #${object.userData.id}.`, 'ok');
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
  if (selected) { highlight(selected, true); transform.attach(selected); }
  else transform.detach();
  updateSelectionHud(); updateShadowReadout();
}
function clearSelection() { selectObject(null); }

function updateSelectionHud() {
  if (!selected) { $('selectionHud').textContent = 'Zaznaczenie: brak'; return; }
  const kind = selected.userData.kind === 'mountain' ? 'góra' : 'dolina';
  const pair = selected.userData.pairedWith ? ` • para #${selected.userData.pairedWith}` : ' • bez pary';
  const angle = THREE.MathUtils.radToDeg(selected.rotation.y);
  $('selectionHud').textContent = `Zaznaczenie: ${kind} #${selected.userData.id}${pair} • ${fmt(selected.userData.volume)} km³ • X ${fmt(selected.position.x,1)} km • Z ${fmt(selected.position.z,1)} km • obrót ${fmt(angle,0)}°`;
}

function rotateSelected(deltaDeg) {
  if (!selected || selected.userData.kind !== 'mountain') return setMessage('Zaznacz górę, aby zmienić jej orientację.', 'error');
  selected.rotation.y += THREE.MathUtils.degToRad(deltaDeg);
  updateSelectionHud();
  setMessage(`Obrócono górę #${selected.userData.id} o ${deltaDeg > 0 ? '+' : ''}${deltaDeg}°.`, 'ok');
}

function optimizeShade() {
  if (!selected || selected.userData.kind !== 'mountain') return setMessage('Zaznacz górę, aby ustawić jej ścianę względem kierunku Słońca.', 'error');
  const az = THREE.MathUtils.degToRad(Number($('sunAzimuth').value));
  selected.rotation.y = -az + Math.PI / 4;
  updateSelectionHud();
  setMessage('Ustawiono jedną ścianę góry prostopadle do kierunku promieniowania. To geometria cienia, nie optymalizacja termiczna.', 'ok');
}

function snapSelected() {
  if (!selected) return setMessage('Najpierw zaznacz obiekt.', 'error');
  selected.position.x = Math.round(selected.position.x / 2) * 2;
  selected.position.z = Math.round(selected.position.z / 2) * 2;
  if (selected.userData.kind === 'valley') updateTerrain();
  else selected.position.y = terrainHeightAt(selected.position.x, selected.position.z);
  updateSelectionHud();
  setMessage('Przyciągnięto obiekt do siatki 2 km.', 'ok');
}

function updateShadowReadout() {
  if (!selected || selected.userData.kind !== 'mountain') { $('shadowLength').textContent = '—'; return; }
  const el = THREE.MathUtils.degToRad(Number($('sunElevation').value));
  const length = selected.userData.shape.height / Math.max(0.02, Math.tan(el));
  $('shadowLength').textContent = `${fmt(length, 2)} km`;
}

function createTree(x, z, hostValley = null, rel = null) {
  const heightM = Number($('treeHeight').value);
  const heightKm = heightM / 1000;
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(heightKm * 0.045, heightKm * 0.06, heightKm * 0.62, 5), new THREE.MeshStandardMaterial({ color: 0x5b351b, roughness: 1 }));
  trunk.position.y = heightKm * 0.31; group.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(heightKm * 0.22, heightKm * 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x4d7b32, roughness: 1 }));
  crown.position.y = heightKm * 0.75; group.add(crown);
  const markerGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, heightKm, 0)]);
  const marker = new THREE.Points(markerGeom, new THREE.PointsMaterial({ color: 0x77ff91, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.78 }));
  group.add(marker);
  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData = { heightM, hostValleyId: hostValley ? hostValley.userData.id : null, relX: rel ? rel.x : 0, relZ: rel ? rel.z : 0, marker, crown };
  scene.add(group); trees.push(group);
  return group;
}

function plantAtSelectedValley(count = 100) {
  let valley = selected && selected.userData.kind === 'valley' ? selected : null;
  if (!valley && selected && selected.userData.kind === 'mountain' && selected.userData.pairedWith) valley = findObjectById(selected.userData.pairedWith);
  if (!valley) valley = objects.find((o) => o.userData.kind === 'valley') || null;
  if (!valley) return setMessage('Najpierw utwórz lub zaznacz dolinę.', 'error');
  const half = valley.userData.shape.base * 0.42;
  for (let i = 0; i < count; i++) {
    const rx = (Math.random() - 0.5) * 2 * half;
    const rz = (Math.random() - 0.5) * 2 * half;
    createTree(valley.position.x + rx, valley.position.z + rz, valley, { x: rx, z: rz });
  }
  updateMetrics(); updateWaterAndVegetation();
  setMessage(`Posadzono ${count} drzew w dolinie #${valley.userData.id}. Geometria drzew zachowuje skalę metrową względem kilometrowych gór.`, 'ok');
}

function updateHostedTrees() {
  for (const tree of trees) {
    const id = tree.userData.hostValleyId;
    if (!id) { tree.position.y = terrainHeightAt(tree.position.x, tree.position.z); continue; }
    const valley = findObjectById(id);
    if (!valley) { tree.userData.hostValleyId = null; continue; }
    tree.position.x = valley.position.x + tree.userData.relX;
    tree.position.z = valley.position.z + tree.userData.relZ;
    tree.position.y = terrainHeightAt(tree.position.x, tree.position.z);
  }
}

function clearTrees() {
  while (trees.length) {
    const tree = trees.pop(); scene.remove(tree);
    tree.traverse((child) => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
  }
  updateMetrics(); updateWaterAndVegetation(); setMessage('Usunięto wszystkie drzewa ze sceny.', 'ok');
}

function updateWaterAndVegetation() {
  const retention = scenarioRetention();
  const showWater = $('showWater').checked;
  let waterM3 = 0;
  for (const valley of objects.filter((o) => o.userData.kind === 'valley')) {
    const pairedBoost = valley.userData.pairedWith ? 0.12 : 0;
    const local = clamp(retention + pairedBoost, 0, 1);
    valley.userData.waterFraction = local;
    const depthKm = local < 0.06 ? 0 : 0.002 + local * 0.018;
    const sideKm = valley.userData.shape.top * (0.55 + 0.35 * local);
    valley.userData.water.visible = showWater && depthKm > 0;
    valley.userData.water.scale.setScalar(0.55 + 0.35 * local);
    valley.userData.water.position.y = -valley.userData.shape.height + 0.06 + depthKm;
    waterM3 += sideKm * sideKm * depthKm * 1e9;
  }
  $('waterStored').textContent = `${fmt(waterM3 / 1e6, 1)} mln m³`;
  const sunEl = Number($('sunElevation').value);
  const shade = clamp(1 - Math.sin(THREE.MathUtils.degToRad(sunEl)), 0, 1);
  const score = clamp(Math.round(22 + retention * 58 + shade * 20), 0, 100);
  $('plantScore').textContent = `${score}/100`;
  for (const tree of trees) {
    const c = new THREE.Color(); c.setHSL(0.22 + score / 800, 0.52, 0.28 + score / 500);
    tree.userData.crown.material.color.copy(c);
    tree.userData.marker.material.color.copy(c.offsetHSL(0, 0.1, 0.18));
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (transformDragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (plantingMode) {
    const terrainHits = raycaster.intersectObject(terrain, false);
    if (terrainHits.length) {
      const p = terrainHits[0].point;
      createTree(p.x, p.z);
      updateMetrics(); updateWaterAndVegetation();
      setMessage(`Dodano drzewo ${Number($('treeHeight').value)} m. Przy kilometrowych górach pozostaje ono bardzo małe.`, 'ok');
      return;
    }
  }
  const pickables = [];
  for (const object of objects) object.traverse((child) => { if (child.isMesh && child.userData.owner) pickables.push(child); });
  const hits = raycaster.intersectObjects(pickables, false);
  if (hits.length) selectObject(hits[0].object.userData.owner);
});

function clearObjects() {
  clearSelection();
  while (objects.length) {
    const object = objects.pop(); scene.remove(object);
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]; mats.forEach((mat) => mat.dispose());
      }
    });
  }
}

function resetDemo() {
  clearTrees(); clearObjects(); nextId = 1; scenarioStage = 0;
  const shape = { base: 8, top: 2, height: 2.5, volume: frustumVolume(8, 2, 2.5) };
  const siteValley = createValley(shape, 14, 8);
  const siteMountain = createMountain(shape, SITE.x, SITE.z, { pairedWith: siteValley.userData.id, site: true });
  siteValley.userData.pairedWith = siteMountain.userData.id;
  const small = { base: 5, top: 1.5, height: 1.5, volume: frustumVolume(5, 1.5, 1.5) };
  const v2 = createValley(small, 28, -14);
  const m2 = createMountain(small, -14, 15, { pairedWith: v2.userData.id }); v2.userData.pairedWith = m2.userData.id;
  createValley(small, 34, 10);
  updateTerrain(); updateMetrics(); updateWaterAndVegetation(); clearSelection();
  setMessage('Scena zresetowana. Główna góra stoi w punkcie referencyjnym 23.515002°N, 11.998501°E; każda gotowa góra ma dolinę 1:1.', 'ok');
}

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
function animate() { requestAnimationFrame(animate); orbit.update(); renderer.render(scene, camera); }

['baseSize', 'topSize', 'heightSize'].forEach((id) => $(id).addEventListener('input', updateShapeOutputs));
$('digValley').addEventListener('click', () => digValley());
$('buildMountain').addEventListener('click', () => buildMountain());
$('createPair').addEventListener('click', () => createPair());
$('duplicateSelected').addEventListener('click', duplicateSelected);
$('deleteSelected').addEventListener('click', deleteSelected);
$('snapSelected').addEventListener('click', snapSelected);
$('sunAzimuth').addEventListener('input', updateSun);
$('sunElevation').addEventListener('input', updateSun);
$('rotateLeft').addEventListener('click', () => rotateSelected(-5));
$('rotateRight').addEventListener('click', () => rotateSelected(5));
$('optimizeShade').addEventListener('click', optimizeShade);
$('maxShadePreset').addEventListener('click', () => { $('sunElevation').value = 10; $('sunAzimuth').value = 225; updateSun(); setMessage('Preset długiego cienia: wysokość Słońca 10°. To scenariusz geometryczny.', 'ok'); });
$('rainScenario').addEventListener('input', () => { $('rainOut').textContent = `${$('rainScenario').value}%`; updateWaterAndVegetation(); });
$('treeHeight').addEventListener('input', () => { $('treeHeightOut').textContent = `${$('treeHeight').value} m`; });
$('plantMode').addEventListener('click', () => { plantingMode = !plantingMode; $('plantMode').classList.toggle('active', plantingMode); $('plantMode').textContent = `+ Sadź drzewka: ${plantingMode ? 'WŁ.' : 'WYŁ.'}`; setMessage(plantingMode ? 'Tryb sadzenia aktywny: kliknij powierzchnię terenu.' : 'Tryb sadzenia wyłączony.', 'ok'); });
$('plantSelectedValley').addEventListener('click', () => plantAtSelectedValley(100));
$('clearTrees').addEventListener('click', clearTrees);
$('advanceScenario').addEventListener('click', () => { scenarioStage = Math.min(10, scenarioStage + 1); updateWaterAndVegetation(); setMessage(`Etap retencji: ${scenarioStage}/10. To wskaźnik scenariuszowy, nie prognoza opadu.`, 'ok'); });
$('showWater').addEventListener('change', updateWaterAndVegetation);
$('showChannel').addEventListener('change', (event) => { channelEnabled = event.target.checked; channelVisual.visible = channelEnabled; channelBranch.visible = channelEnabled; updateTerrain(); });
$('showGrid').addEventListener('change', (event) => { grid.visible = event.target.checked; });
$('resetScene').addEventListener('click', resetDemo);
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(viewer);

updateShapeOutputs(); updateSun(); resetDemo(); resize(); animate();
