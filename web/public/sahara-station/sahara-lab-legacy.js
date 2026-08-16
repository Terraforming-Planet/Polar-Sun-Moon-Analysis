import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value).toLocaleString('pl-PL', { maximumFractionDigits: digits });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const bind = (id, event, handler) => {
  const element = $(id);
  if (element) element.addEventListener(event, handler);
};

// Ten sam fundament logiczny co w otwartym silniku Cube Chess 512: 8 × 8 × 8.
const BOARD_SIZE = 8;
const TOTAL_LEVELS = 8;
const TOTAL_SQUARES = BOARD_SIZE ** 2 * TOTAL_LEVELS;
const CELL_SIZE = 6; // km
const LEVEL_SPACING = 2.25; // km
const GRID_SPAN = BOARD_SIZE * CELL_SIZE;
const TERRAIN_SIZE = 66; // km
const TERRAIN_SEGMENTS = 64;
const WORLD_LIMIT = TERRAIN_SIZE / 2 - 2;
const SITE = { lat: 23.515002, lon: 11.998501, x: 0, z: 0 };
const COPERNICUS_DEM_90M = 'https://copernicus-dem-90m.s3.amazonaws.com';
const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';
const DEM_BBOX = {
  west: SITE.lon - 0.28,
  east: SITE.lon + 0.28,
  south: SITE.lat - 0.24,
  north: SITE.lat + 0.24,
};

const objects = [];
const trees = [];
const demTiles = [];
const gridMeshes = [];
let selected = null;
let nextId = 1;
let plantingMode = false;
let channelEnabled = true;
let scenarioStage = 0;
let transform = null;
let transformDragging = false;
let siteElevationM = null;
let demReady = false;

const viewer = $('viewer');
if (!viewer) throw new Error('Brak kontenera #viewer dla Stacji badawczej Sahara.');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label', 'Model 3D Sahara oparty na siatce 8×8×8 = 512 pól');
viewer.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb76d31);
scene.fog = new THREE.Fog(0xb76d31, 55, 118);

const camera = new THREE.PerspectiveCamera(47, 1, 0.08, 240);
camera.position.set(39, 29, 47);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 2.3, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.065;
orbit.minDistance = 8;
orbit.maxDistance = 105;
orbit.maxPolarAngle = Math.PI * 0.495;

scene.add(new THREE.HemisphereLight(0xffe6bd, 0x4c2812, 1.8));
const sun = new THREE.DirectionalLight(0xfff1cb, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -54;
sun.shadow.camera.right = 54;
sun.shadow.camera.top = 54;
sun.shadow.camera.bottom = -54;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.00025;
scene.add(sun);
scene.add(sun.target);

function createRuntimeHud() {
  const grid = document.createElement('div');
  grid.id = 'grid512Status';
  grid.className = 'site-marker';
  grid.style.top = '86px';
  grid.style.right = '12px';
  grid.style.color = '#bfffd4';
  grid.style.borderColor = '#3f8e5d';
  grid.textContent = 'GRID 512: 8×8×8 • 512 pól';
  viewer.appendChild(grid);

  const dem = document.createElement('div');
  dem.id = 'demStatus';
  dem.className = 'selection-hud';
  dem.style.left = 'auto';
  dem.style.right = '12px';
  dem.style.bottom = '12px';
  dem.style.maxWidth = 'min(64%, 520px)';
  dem.style.color = '#d7f5ff';
  dem.style.borderColor = '#4e8297';
  dem.textContent = 'DEM: scena 512 działa • Copernicus GLO-90 ładuje się w tle';
  viewer.appendChild(dem);

  const topbarLinks = document.querySelector('.topbar div');
  const lab = document.querySelector('.lab-layout');
  const paleo = document.querySelector('.paleorivers');
  const refs = document.querySelector('.references');
  if (lab) lab.id = 'model-512';
  if (paleo) paleo.id = 'paleohydrologia';
  if (refs) refs.id = 'material-referencyjny';
  if (topbarLinks && !document.getElementById('runtimeTabs512')) {
    const modelLink = document.createElement('a');
    modelLink.href = '#model-512';
    modelLink.textContent = 'Model 512';
    const paleoLink = document.createElement('a');
    paleoLink.href = '#paleohydrologia';
    paleoLink.textContent = 'Paleohydrologia';
    const refsLink = document.createElement('a');
    refsLink.href = '#material-referencyjny';
    refsLink.textContent = 'Materiały';
    const marker = document.createElement('span');
    marker.id = 'runtimeTabs512';
    marker.style.display = 'none';
    topbarLinks.append(modelLink, paleoLink, refsLink, marker);
  }

  const gridInput = $('showGrid');
  if (gridInput) {
    gridInput.checked = true;
    const label = gridInput.closest('label');
    if (label) {
      const textNodes = [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
      if (textNodes.length) textNodes[textNodes.length - 1].textContent = ' Pokaż silnik przestrzenny 512 (8×8×8)';
    }
  }
}

createRuntimeHud();

function setDemStatus(text, mode = 'info') {
  const element = $('demStatus');
  if (!element) return;
  element.textContent = text;
  element.style.color = mode === 'ok' ? '#bfffd4' : mode === 'error' ? '#ffd0ba' : '#d7f5ff';
}

function setMessage(text, kind = '') {
  const element = $('actionMessage');
  if (!element) return;
  element.textContent = text;
  element.className = `action-message ${kind}`.trim();
}

function frustumVolume(base, top, height) {
  return height / 3 * (base * base + base * top + top * top);
}

function arcticReferenceShape() {
  const base = 20;
  const top = 2;
  const height = 8;
  return { base, top, height, volume: frustumVolume(base, top, height) };
}

function currentShape() {
  const base = Math.max(0.5, Number($('baseSize')?.value ?? 20));
  const top = Math.min(base - 0.1, Math.max(0.2, Number($('topSize')?.value ?? 2)));
  const height = Math.max(0.1, Number($('heightSize')?.value ?? 8));
  return { base, top, height, volume: frustumVolume(base, top, height) };
}

function sameShape(a, b) {
  return Math.abs(a.base - b.base) < 1e-6
    && Math.abs(a.top - b.top) < 1e-6
    && Math.abs(a.height - b.height) < 1e-6;
}

function configureReferenceSliders() {
  const base = $('baseSize');
  const top = $('topSize');
  const height = $('heightSize');
  if (base) { base.max = '32'; base.value = '20'; }
  if (top) { top.max = '12'; top.value = '2'; }
  if (height) { height.max = '12'; height.value = '8'; }
}

configureReferenceSliders();

function gridCellIndex(col, row, layer = 0) {
  return layer * BOARD_SIZE * BOARD_SIZE + row * BOARD_SIZE + col;
}

function worldToGridCell(x, z) {
  const half = GRID_SPAN / 2;
  const col = clamp(Math.floor((x + half) / CELL_SIZE), 0, BOARD_SIZE - 1);
  const row = clamp(Math.floor((z + half) / CELL_SIZE), 0, BOARD_SIZE - 1);
  return { col, row };
}

function cellAddress(col, row, layer = 0) {
  const index = gridCellIndex(col, row, layer);
  return `CELL-${String(index + 1).padStart(3, '0')} · X${col + 1} Y${row + 1} Z${layer + 1}`;
}

const gridRoot = new THREE.Group();
gridRoot.name = 'CubeChess512SpatialEngine';
scene.add(gridRoot);

function buildGrid512() {
  const plane = new THREE.PlaneGeometry(CELL_SIZE * 0.94, CELL_SIZE * 0.94);
  plane.rotateX(-Math.PI / 2);
  const matrix = new THREE.Matrix4();

  for (let layer = 0; layer < TOTAL_LEVELS; layer += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: layer === 0 ? 0xf2a75e : 0x78d7ff,
      wireframe: true,
      transparent: true,
      opacity: layer === 0 ? 0.22 : 0.055,
      depthWrite: false,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(plane, material, BOARD_SIZE * BOARD_SIZE);
    mesh.name = `Grid512Layer${layer + 1}`;
    let instance = 0;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const x = (col - (BOARD_SIZE - 1) / 2) * CELL_SIZE;
        const z = (row - (BOARD_SIZE - 1) / 2) * CELL_SIZE;
        const y = 0.28 + layer * LEVEL_SPACING;
        matrix.makeTranslation(x, y, z);
        mesh.setMatrixAt(instance, matrix);
        mesh.setColorAt(instance, new THREE.Color((col + row + layer) % 2 === 0 ? 0xf0a45b : 0x75cce8));
        instance += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.layer = layer;
    gridRoot.add(mesh);
    gridMeshes.push(mesh);
  }

  const cubeHeight = (TOTAL_LEVELS - 1) * LEVEL_SPACING + 0.6;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(GRID_SPAN, cubeHeight, GRID_SPAN)),
    new THREE.LineBasicMaterial({ color: 0x93e4ff, transparent: true, opacity: 0.16 }),
  );
  edges.position.y = cubeHeight / 2 + 0.1;
  edges.name = 'Grid512Boundary';
  gridRoot.add(edges);
}

buildGrid512();

const terrainGeometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
terrainGeometry.rotateX(-Math.PI / 2);
const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({ color: 0xc98943, roughness: 0.98, metalness: 0, side: THREE.DoubleSide }),
);
terrain.name = 'SaharaTerrain';
terrain.receiveShadow = true;
scene.add(terrain);

const channelPoints = [
  [-30, -15], [-25, -12], [-20, -14], [-15, -8], [-10, -7], [-6, -3],
  [-2, -5], [3, -1], [8, 2], [13, 1], [18, 6], [24, 8], [29, 12],
];

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const denominator = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / denominator, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function channelDepression(x, z) {
  if (!channelEnabled) return 0;
  let minimum = Infinity;
  for (let index = 0; index < channelPoints.length - 1; index += 1) {
    const [ax, az] = channelPoints[index];
    const [bx, bz] = channelPoints[index + 1];
    minimum = Math.min(minimum, pointSegmentDistance(x, z, ax, az, bx, bz));
  }
  const width = 1.25;
  if (minimum >= width) return 0;
  const q = 1 - minimum / width;
  return -0.18 * q * q;
}

const channelCurve = new THREE.CatmullRomCurve3(
  channelPoints.map(([x, z]) => new THREE.Vector3(x, 0.35, z)),
  false,
  'catmullrom',
  0.25,
);
const channelVisual = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(channelCurve.getPoints(180)),
  new THREE.LineBasicMaterial({ color: 0x5d2e19, transparent: true, opacity: 0.9 }),
);
scene.add(channelVisual);

function fallbackTerrainHeight(x, z) {
  const broad = Math.sin(x * 0.10) * 0.22 + Math.cos(z * 0.085) * 0.18;
  const dunes = Math.sin(x * 0.22 + Math.cos(z * 0.07) * 1.8) * 0.09;
  return broad + dunes;
}

function kmToLatLon(x, z) {
  const lat = SITE.lat + z / 111.32;
  const lonScale = 111.32 * Math.cos(THREE.MathUtils.degToRad(lat));
  return { lat, lon: SITE.lon + x / Math.max(lonScale, 0.01) };
}

function sampleRasterTile(tile, lat, lon) {
  const { bbox, values, width, height } = tile;
  if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) return null;
  const u = clamp((lon - bbox[0]) / (bbox[2] - bbox[0]), 0, 1);
  const v = clamp((bbox[3] - lat) / (bbox[3] - bbox[1]), 0, 1);
  const fx = u * (width - 1);
  const fy = v * (height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x, y) => Number(values[y * width + x]);
  const a = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const b = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return a * (1 - ty) + b * ty;
}

function demMetersAt(x, z) {
  if (!demReady || !demTiles.length) return null;
  const { lat, lon } = kmToLatLon(x, z);
  for (const tile of demTiles) {
    const value = sampleRasterTile(tile, lat, lon);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function baseTerrainHeight(x, z) {
  const meters = demMetersAt(x, z);
  if (Number.isFinite(meters) && Number.isFinite(siteElevationM)) {
    return (meters - siteElevationM) / 1000 + channelDepression(x, z);
  }
  return fallbackTerrainHeight(x, z) + channelDepression(x, z);
}

function valleyOffsetAt(x, z, object) {
  const { base, top, height } = object.userData.shape;
  const dx = Math.abs(x - object.position.x);
  const dz = Math.abs(z - object.position.z);
  const radius = Math.max(dx, dz);
  const outer = base / 2;
  const inner = Math.min(top / 2, outer - 0.01);
  if (radius >= outer) return 0;
  if (radius <= inner) return -height;
  const t = (radius - inner) / Math.max(0.01, outer - inner);
  return -height * (1 - t);
}

function terrainHeightAt(x, z) {
  const baseline = baseTerrainHeight(x, z);
  let y = baseline;
  for (const object of objects) {
    if (object.userData.kind !== 'valley') continue;
    const offset = valleyOffsetAt(x, z, object);
    if (offset < 0) y = Math.min(y, baseline + offset);
  }
  return y;
}

function updateTerrain() {
  const position = terrainGeometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, terrainHeightAt(x, z));
  }
  position.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  updateObjectGrounding();
  updateHostedTrees();
}

function arcticMountainGeometry(shape) {
  const geometry = new THREE.CylinderGeometry(
    shape.top / Math.SQRT2,
    shape.base / Math.SQRT2,
    shape.height,
    4,
    1,
    false,
  );
  geometry.rotateY(Math.PI / 4);
  return geometry;
}

function materialFor(kind) {
  if (kind === 'mountain') {
    return new THREE.MeshStandardMaterial({ color: 0x8e8172, roughness: 0.88, metalness: 0.02, emissive: 0x000000 });
  }
  return new THREE.MeshStandardMaterial({
    color: 0x5d321c,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function createMountain(shape, x, z, options = {}) {
  const group = new THREE.Group();
  const geometry = arcticMountainGeometry(shape);
  const mesh = new THREE.Mesh(geometry, materialFor('mountain'));
  mesh.position.y = shape.height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const plateau = new THREE.Mesh(
    new THREE.BoxGeometry(shape.top, 0.12, shape.top),
    new THREE.MeshStandardMaterial({ color: 0xd7d4cb, roughness: 0.75, emissive: 0x000000 }),
  );
  plateau.position.y = shape.height + 0.06;
  plateau.castShadow = true;
  plateau.receiveShadow = true;
  group.add(plateau);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xffdfaa, transparent: true, opacity: 0 }),
  );
  edges.position.y = shape.height / 2;
  group.add(edges);

  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData = {
    id: nextId++, kind: 'mountain', shape: { ...shape }, volume: shape.volume,
    pairedWith: options.pairedWith ?? null, site: Boolean(options.site), mesh, plateau, edges,
  };
  mesh.userData.owner = group;
  plateau.userData.owner = group;
  scene.add(group);
  objects.push(group);
  updateGridOccupancy();
  return group;
}

function createValley(shape, x, z, options = {}) {
  const group = new THREE.Group();
  const picker = new THREE.Mesh(
    new THREE.CylinderGeometry(shape.base / Math.SQRT2, shape.top / Math.SQRT2, shape.height, 4, 1, true),
    materialFor('valley'),
  );
  picker.rotation.y = Math.PI / 4;
  picker.position.y = -shape.height / 2;
  picker.userData.owner = group;
  group.add(picker);

  const rim = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-shape.base / 2, 0.12, -shape.base / 2),
      new THREE.Vector3(shape.base / 2, 0.12, -shape.base / 2),
      new THREE.Vector3(shape.base / 2, 0.12, shape.base / 2),
      new THREE.Vector3(-shape.base / 2, 0.12, shape.base / 2),
      new THREE.Vector3(-shape.base / 2, 0.12, -shape.base / 2),
    ]),
    new THREE.LineBasicMaterial({ color: 0x8ce9ff, transparent: true, opacity: 0.82 }),
  );
  group.add(rim);

  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(shape.top, 0.08, shape.top),
    new THREE.MeshStandardMaterial({ color: 0x5b3a27, roughness: 1 }),
  );
  bottom.position.y = -shape.height + 0.04;
  bottom.receiveShadow = true;
  group.add(bottom);

  const water = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.2, shape.top), 0.035, Math.max(0.2, shape.top)),
    new THREE.MeshStandardMaterial({ color: 0x2f91c7, roughness: 0.16, transparent: true, opacity: 0.62 }),
  );
  water.position.y = -shape.height + 0.12;
  water.visible = false;
  group.add(water);

  group.position.set(x, baseTerrainHeight(x, z), z);
  group.userData = {
    id: nextId++, kind: 'valley', shape: { ...shape }, volume: shape.volume,
    pairedWith: options.pairedWith ?? null, picker, rim, bottom, water, waterFraction: 0,
  };
  scene.add(group);
  objects.push(group);
  updateTerrain();
  updateGridOccupancy();
  return group;
}

function createSiteBeacon() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.09, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff5148 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  group.add(ring);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0xff6a61 }));
  pole.position.y = 1.6;
  group.add(pole);
  group.position.set(0, baseTerrainHeight(0, 0), 0);
  scene.add(group);
  return group;
}

const siteBeacon = createSiteBeacon();

function createResearchStation() {
  const station = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.4, 0.25, 12),
    new THREE.MeshStandardMaterial({ color: 0x22272a, roughness: 0.55, metalness: 0.28 }),
  );
  base.position.y = 0.15;
  base.castShadow = true;
  station.add(base);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8edbe5, roughness: 0.2, transparent: true, opacity: 0.68 }),
  );
  dome.position.y = 0.3;
  dome.castShadow = true;
  station.add(dome);
  station.position.set(-22, baseTerrainHeight(-22, 17), 17);
  scene.add(station);
  return station;
}

const researchStation = createResearchStation();

function updateObjectGrounding() {
  for (const object of objects) {
    object.position.y = object.userData.kind === 'mountain'
      ? terrainHeightAt(object.position.x, object.position.z)
      : baseTerrainHeight(object.position.x, object.position.z);
  }
  siteBeacon.position.y = baseTerrainHeight(0, 0);
  researchStation.position.y = baseTerrainHeight(researchStation.position.x, researchStation.position.z);
}

function totals() {
  let excavated = 0;
  let used = 0;
  let mountains = 0;
  let valleys = 0;
  let pairs = 0;
  for (const object of objects) {
    if (object.userData.kind === 'valley') {
      excavated += object.userData.volume;
      valleys += 1;
      if (object.userData.pairedWith) pairs += 1;
    } else {
      used += object.userData.volume;
      mountains += 1;
    }
  }
  return { excavated, used, bank: excavated - used, mountains, valleys, pairs }; // bank: excavated - used
}

function findObjectById(id) {
  return objects.find((object) => object.userData.id === id) ?? null;
}

function findUnpairedValleyForShape(shape) {
  return objects.find((object) => (
    object.userData.kind === 'valley' && !object.userData.pairedWith && sameShape(object.userData.shape, shape)
  )) ?? null;
}

function updateGridOccupancy() {
  if (!gridMeshes.length) return;
  const neutralA = new THREE.Color(0xf0a45b);
  const neutralB = new THREE.Color(0x75cce8);
  const mountainColor = new THREE.Color(0xff8b3d);
  const valleyColor = new THREE.Color(0x49bde4);
  const treeColor = new THREE.Color(0x6fe18a);
  for (let layer = 0; layer < gridMeshes.length; layer += 1) {
    const mesh = gridMeshes[layer];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        mesh.setColorAt(row * BOARD_SIZE + col, (col + row + layer) % 2 === 0 ? neutralA : neutralB);
      }
    }
  }
  for (const object of objects) {
    const { col, row } = worldToGridCell(object.position.x, object.position.z);
    const maxLayer = object.userData.kind === 'mountain'
      ? clamp(Math.ceil(object.userData.shape.height / LEVEL_SPACING), 1, TOTAL_LEVELS)
      : 1;
    for (let layer = 0; layer < maxLayer; layer += 1) {
      gridMeshes[layer].setColorAt(row * BOARD_SIZE + col, object.userData.kind === 'mountain' ? mountainColor : valleyColor);
    }
  }
  for (const tree of trees) {
    const { col, row } = worldToGridCell(tree.position.x, tree.position.z);
    gridMeshes[0].setColorAt(row * BOARD_SIZE + col, treeColor);
  }
  for (const mesh of gridMeshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function updateMetrics() {
  const total = totals();
  if ($('mountainCount')) $('mountainCount').textContent = total.mountains;
  if ($('valleyCount')) $('valleyCount').textContent = total.valleys;
  if ($('pairedCount')) $('pairedCount').textContent = total.pairs;
  if ($('excavatedTotal')) $('excavatedTotal').textContent = `${fmt(total.excavated)} km³`;
  if ($('usedTotal')) $('usedTotal').textContent = `${fmt(total.used)} km³`;
  if ($('materialBank')) {
    $('materialBank').textContent = `${fmt(total.bank)} km³`;
    $('materialBank').style.color = total.bank < -0.001 ? '#ff9a72' : '#96edb2';
  }
  if ($('treeCount')) $('treeCount').textContent = trees.length.toLocaleString('pl-PL');
  if ($('buildMountain')) $('buildMountain').disabled = !findUnpairedValleyForShape(currentShape());
  updateGridOccupancy();
}


function updateShapeLimits() {
  const baseInput = $('baseSize');
  const topInput = $('topSize');
  if (!baseInput || !topInput) return;
  const base = Math.max(0.5, Number(baseInput.value || 0.5));
  const safeMax = Math.max(Number(topInput.min || 0.2), base - 0.1);
  topInput.max = String(safeMax);
  if (Number(topInput.value) > safeMax) topInput.value = String(safeMax);
}

function placementRadius(shape) {
  return Math.max(2.2, shape.base * 0.58);
}

function placementIsFree(shape, x, z) {
  const margin = shape.base / 2 + 0.8;
  if (Math.abs(x) > WORLD_LIMIT - margin || Math.abs(z) > WORLD_LIMIT - margin) return false;
  const radius = placementRadius(shape);
  return objects.every((object) => {
    const required = radius + placementRadius(object.userData.shape);
    return Math.hypot(x - object.position.x, z - object.position.z) >= required;
  });
}

function findFreePlacement(shape, preferred = { x: 0, z: 0 }) {
  const startX = clamp(preferred.x, -WORLD_LIMIT, WORLD_LIMIT);
  const startZ = clamp(preferred.z, -WORLD_LIMIT, WORLD_LIMIT);
  if (placementIsFree(shape, startX, startZ)) return { x: startX, z: startZ };
  const step = Math.max(CELL_SIZE, shape.base * 0.72);
  for (let ring = 1; ring <= 8; ring += 1) {
    const candidates = [];
    for (let dx = -ring; dx <= ring; dx += 1) candidates.push([dx, -ring], [dx, ring]);
    for (let dz = -ring + 1; dz < ring; dz += 1) candidates.push([-ring, dz], [ring, dz]);
    for (const [dx, dz] of candidates) {
      const x = clamp(startX + dx * step, -WORLD_LIMIT, WORLD_LIMIT);
      const z = clamp(startZ + dz * step, -WORLD_LIMIT, WORLD_LIMIT);
      if (placementIsFree(shape, x, z)) return { x, z };
    }
  }
  return { x: startX, z: startZ };
}

function updateShapeOutputs() {
  updateShapeLimits();
  const shape = currentShape();
  if ($('baseOut')) $('baseOut').textContent = `${fmt(shape.base, 1)} km`;
  if ($('topOut')) $('topOut').textContent = `${fmt(shape.top, 1)} km`;
  if ($('heightOut')) $('heightOut').textContent = `${fmt(shape.height, 1)} km`;
  if ($('newVolume')) $('newVolume').textContent = `${fmt(shape.volume)} km³`;
  const preview = document.querySelector('.shape-preview span');
  if (preview) preview.textContent = `NOWY OBIEKT: ${fmt(shape.base, 1)} × ${fmt(shape.top, 1)} × ${fmt(shape.height, 1)} km • objętość`;
  updateMetrics();
}

function digValley(shape = currentShape(), at = null) {
  const placement = at ?? findFreePlacement(shape, { x: 17, z: -11 });
  const valley = createValley(shape, clamp(placement.x, -WORLD_LIMIT, WORLD_LIMIT), clamp(placement.z, -WORLD_LIMIT, WORLD_LIMIT));
  updateMetrics();
  updateWaterAndVegetation();
  selectObject(valley);
  setMessage(`Wykopano dolinę #${valley.userData.id}. Materiał ${fmt(shape.volume)} km³ jest dostępny dla jednej zgodnej góry.`, 'ok');
  return valley;
}

function buildMountain(shape = currentShape(), at = null, options = {}) {
  const sourceValley = options.sourceValley ?? findUnpairedValleyForShape(shape);
  if (!sourceValley) {
    setMessage('Najpierw wykop dolinę o identycznej geometrii. Model 1:1 nie tworzy materiału z niczego.', 'error');
    return null;
  }
  const placement = at ?? findFreePlacement(shape, { x: -12, z: 8 });
  const mountain = createMountain(
    shape,
    clamp(placement.x, -WORLD_LIMIT, WORLD_LIMIT),
    clamp(placement.z, -WORLD_LIMIT, WORLD_LIMIT),
    { pairedWith: sourceValley.userData.id, site: Boolean(options.site) },
  );
  sourceValley.userData.pairedWith = mountain.userData.id;
  updateMetrics();
  updateWaterAndVegetation();
  selectObject(mountain);
  setMessage(`Zbudowano górę #${mountain.userData.id} z materiału doliny #${sourceValley.userData.id}.`, 'ok');
  return mountain;
}

function createPair(shape = currentShape(), near = null) {
  const center = near ?? findFreePlacement(shape, { x: 8, z: 10 });
  const valleySpot = findFreePlacement(shape, { x: center.x + Math.max(8, shape.base * 0.7), z: center.z - Math.max(6, shape.base * 0.45) });
  const valley = digValley(shape, valleySpot);
  const mountainSpot = findFreePlacement(shape, { x: center.x - Math.max(8, shape.base * 0.7), z: center.z + Math.max(5, shape.base * 0.45) });
  const mountain = buildMountain(shape, mountainSpot, { sourceValley: valley });
  return { valley, mountain };
}

function duplicateSelected() {
  if (!selected) { setMessage('Najpierw zaznacz górę albo dolinę.', 'error'); return; }
  const shape = { ...selected.userData.shape, volume: selected.userData.volume };
  createPair(shape, {
    x: clamp(selected.position.x + 10, -WORLD_LIMIT + 8, WORLD_LIMIT - 8),
    z: clamp(selected.position.z + 9, -WORLD_LIMIT + 8, WORLD_LIMIT - 8),
  });
  setMessage('Powielono pełną parę 1:1: utworzono nową dolinę oraz górę z jej materiału.', 'ok');
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose?.());
    }
  });
}

function deleteSelected() {
  if (!selected) { setMessage('Najpierw zaznacz obiekt do usunięcia.', 'error'); return; }
  const object = selected;
  if (object.userData.kind === 'valley' && object.userData.pairedWith) {
    setMessage(`Dolina #${object.userData.id} zasila istniejącą górę #${object.userData.pairedWith}. Najpierw usuń górę.`, 'error');
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
  disposeObject(object);
  updateTerrain();
  updateMetrics();
  updateWaterAndVegetation();
  setMessage('Usunięto zaznaczony obiekt.', 'ok');
}

function highlight(object, enabled) {
  if (!object) return;
  if (object.userData.kind === 'mountain') {
    object.userData.mesh.material.emissive.setHex(enabled ? 0x342000 : 0x000000);
    object.userData.plateau.material.emissive.setHex(enabled ? 0x342000 : 0x000000);
    object.userData.edges.material.opacity = enabled ? 1 : 0;
  } else {
    object.userData.rim.material.color.setHex(enabled ? 0xffffff : 0x8ce9ff);
    object.userData.picker.material.opacity = enabled ? 0.18 : 0.09;
  }
}

function updateSelectionHud() {
  const hud = $('selectionHud');
  const gridStatus = $('grid512Status');
  if (!selected) {
    if (hud) hud.textContent = 'Zaznaczenie: brak';
    if (gridStatus) gridStatus.textContent = `GRID 512: 8×8×8 • ${TOTAL_SQUARES} pól`;
    return;
  }
  const { col, row } = worldToGridCell(selected.position.x, selected.position.z);
  const label = selected.userData.kind === 'mountain' ? 'góra' : 'dolina';
  if (hud) hud.textContent = `Zaznaczenie: ${label} #${selected.userData.id} • ${cellAddress(col, row, 0)} • ${fmt(selected.userData.volume)} km³`;
  if (gridStatus) gridStatus.textContent = `GRID 512: ${cellAddress(col, row, 0)} • 8 warstw`;
}

function selectObject(object) {
  if (selected === object) return;
  highlight(selected, false);
  selected = object;
  highlight(selected, true);
  if (transform) {
    if (selected) transform.attach(selected);
    else transform.detach();
  }
  updateSelectionHud();
  updateShadowReadout();
}

function clearSelection() { selectObject(null); }

function rotateSelected(delta) {
  if (!selected || selected.userData.kind !== 'mountain') {
    setMessage('Zaznacz górę, aby zmienić jej orientację.', 'error');
    return;
  }
  selected.rotation.y += THREE.MathUtils.degToRad(delta);
  updateSelectionHud();
  setMessage(`Obrócono górę o ${delta > 0 ? '+' : ''}${delta}°.`, 'ok');
}

function snapSelected() {
  if (!selected) { setMessage('Najpierw zaznacz obiekt.', 'error'); return; }
  selected.position.x = clamp(Math.round(selected.position.x / CELL_SIZE) * CELL_SIZE, -WORLD_LIMIT, WORLD_LIMIT);
  selected.position.z = clamp(Math.round(selected.position.z / CELL_SIZE) * CELL_SIZE, -WORLD_LIMIT, WORLD_LIMIT);
  if (selected.userData.kind === 'valley') updateTerrain();
  else selected.position.y = terrainHeightAt(selected.position.x, selected.position.z);
  updateSelectionHud();
  updateGridOccupancy();
  setMessage('Przyciągnięto obiekt do komórki silnika 512.', 'ok');
}

function optimizeShade() {
  if (!selected || selected.userData.kind !== 'mountain') {
    setMessage('Zaznacz górę, aby ustawić ją względem Słońca.', 'error');
    return;
  }
  const azimuth = THREE.MathUtils.degToRad(Number($('sunAzimuth')?.value ?? 225));
  selected.rotation.y = -azimuth + Math.PI / 4;
  updateSelectionHud();
  setMessage('Ustawiono ścianę góry prostopadle do kierunku promieniowania.', 'ok');
}

function updateSun() {
  const azimuth = Number($('sunAzimuth')?.value ?? 225);
  const elevation = Number($('sunElevation')?.value ?? 28);
  if ($('sunAzOut')) $('sunAzOut').textContent = `${fmt(azimuth, 0)}°`;
  if ($('sunElOut')) $('sunElOut').textContent = `${fmt(elevation, 0)}°`;
  if ($('shadowDirection')) $('shadowDirection').textContent = `${fmt((azimuth + 180) % 360, 0)}°`;
  const azimuthRad = THREE.MathUtils.degToRad(azimuth);
  const elevationRad = THREE.MathUtils.degToRad(elevation);
  const radius = 74;
  const horizontal = Math.cos(elevationRad) * radius;
  sun.position.set(Math.sin(azimuthRad) * horizontal, Math.sin(elevationRad) * radius, Math.cos(azimuthRad) * horizontal);
  sun.target.position.set(0, 0, 0);
  updateShadowReadout();
  updateWaterAndVegetation();
}

function updateShadowReadout() {
  if (!$('shadowLength')) return;
  if (!selected || selected.userData.kind !== 'mountain') { $('shadowLength').textContent = '—'; return; }
  const elevation = THREE.MathUtils.degToRad(Number($('sunElevation')?.value ?? 28));
  const length = selected.userData.shape.height / Math.max(0.02, Math.tan(elevation));
  $('shadowLength').textContent = `${fmt(length, 2)} km`;
}

function scenarioRetention() {
  const total = totals();
  const rain = Number($('rainScenario')?.value ?? 35) / 100;
  const network = clamp(total.pairs / 12, 0, 1);
  const stage = clamp(scenarioStage / 10, 0, 1);
  return clamp(rain * 0.28 + network * 0.42 + stage * 0.30, 0, 1);
}

function createTree(x, z, hostValley = null, rel = null) {
  const heightM = Number($('treeHeight')?.value ?? 6);
  const heightKm = heightM / 1000;
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(heightKm * 0.04, heightKm * 0.055, heightKm * 0.62, 5),
    new THREE.MeshStandardMaterial({ color: 0x5b351b, roughness: 1 }),
  );
  trunk.position.y = heightKm * 0.31;
  group.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(heightKm * 0.22, heightKm * 0.62, 6),
    new THREE.MeshStandardMaterial({ color: 0x4e7f35, roughness: 1 }),
  );
  crown.position.y = heightKm * 0.75;
  group.add(crown);
  const marker = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, Math.max(heightKm, 0.002), 0)]),
    new THREE.PointsMaterial({ color: 0x78ff94, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.82 }),
  );
  group.add(marker);
  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData = {
    heightM, hostValleyId: hostValley?.userData.id ?? null,
    relX: rel?.x ?? 0, relZ: rel?.z ?? 0, crown, marker,
  };
  scene.add(group);
  trees.push(group);
  updateGridOccupancy();
  return group;
}

function updateHostedTrees() {
  for (const tree of trees) {
    const hostId = tree.userData.hostValleyId;
    if (!hostId) { tree.position.y = terrainHeightAt(tree.position.x, tree.position.z); continue; }
    const valley = findObjectById(hostId);
    if (!valley) { tree.userData.hostValleyId = null; continue; }
    tree.position.x = valley.position.x + tree.userData.relX;
    tree.position.z = valley.position.z + tree.userData.relZ;
    tree.position.y = terrainHeightAt(tree.position.x, tree.position.z);
  }
}

function plantAtSelectedValley(count = 100) {
  let valley = selected?.userData.kind === 'valley' ? selected : null;
  if (!valley && selected?.userData.kind === 'mountain' && selected.userData.pairedWith) valley = findObjectById(selected.userData.pairedWith);
  if (!valley) valley = objects.find((object) => object.userData.kind === 'valley') ?? null;
  if (!valley) { setMessage('Najpierw utwórz dolinę.', 'error'); return; }
  const half = valley.userData.shape.base * 0.42;
  for (let index = 0; index < count; index += 1) {
    const relX = (Math.random() - 0.5) * 2 * half;
    const relZ = (Math.random() - 0.5) * 2 * half;
    createTree(valley.position.x + relX, valley.position.z + relZ, valley, { x: relX, z: relZ });
  }
  updateMetrics();
  updateWaterAndVegetation();
  setMessage(`Posadzono ${count} drzew w dolinie #${valley.userData.id}. Skala drzew pozostaje metrowa.`, 'ok');
}

function clearTrees() {
  while (trees.length) {
    const tree = trees.pop();
    scene.remove(tree);
    disposeObject(tree);
  }
  updateMetrics();
  updateWaterAndVegetation();
}

function updateWaterAndVegetation() {
  const retention = scenarioRetention();
  const showWater = Boolean($('showWater')?.checked);
  let waterM3 = 0;
  for (const valley of objects.filter((object) => object.userData.kind === 'valley')) {
    const local = clamp(retention + (valley.userData.pairedWith ? 0.12 : 0), 0, 1);
    valley.userData.waterFraction = local;
    const depthKm = local < 0.06 ? 0 : 0.002 + local * 0.018;
    const sideKm = valley.userData.shape.top * (0.55 + 0.35 * local);
    valley.userData.water.visible = showWater && depthKm > 0;
    valley.userData.water.scale.setScalar(0.55 + 0.35 * local);
    valley.userData.water.position.y = -valley.userData.shape.height + 0.09 + depthKm;
    waterM3 += sideKm * sideKm * depthKm * 1e9;
  }
  if ($('waterStored')) $('waterStored').textContent = `${fmt(waterM3 / 1e6, 1)} mln m³`;
  const sunElevation = Number($('sunElevation')?.value ?? 28);
  const shade = clamp(1 - Math.sin(THREE.MathUtils.degToRad(sunElevation)), 0, 1);
  const score = clamp(Math.round(22 + retention * 58 + shade * 20), 0, 100);
  if ($('plantScore')) $('plantScore').textContent = `${score}/100`;
}

function clearObjects() {
  clearSelection();
  while (objects.length) {
    const object = objects.pop();
    scene.remove(object);
    disposeObject(object);
  }
  updateTerrain();
}

function seedInitialSaharaScene() {
  clearTrees();
  clearObjects();
  nextId = 1;
  scenarioStage = 0;
  const shape = arcticReferenceShape();
  const siteValley = createValley(shape, 18, -11);
  const siteMountain = createMountain(shape, 0, 0, { pairedWith: siteValley.userData.id, site: true });
  siteValley.userData.pairedWith = siteMountain.userData.id;
  updateTerrain();
  updateMetrics();
  updateWaterAndVegetation();
  selectObject(siteMountain);
  orbit.target.set(2, 2.4, -1);
  camera.position.set(39, 29, 47);
  orbit.update();
  setMessage(
    'Scena 512 uruchomiona: góra referencyjna 90°N (20 km / plateau 2 km / 8 km) stoi w punkcie 23.515002°N, 11.998501°E, a dolina 1:1 jest widoczna obok.',
    'ok',
  );
}

function resetDemo() {
  configureReferenceSliders();
  updateShapeOutputs();
  seedInitialSaharaScene();
}

function copernicusTileUrl(lat, lon) {
  const latFloor = Math.floor(lat);
  const lonFloor = Math.floor(lon);
  const ns = latFloor >= 0 ? 'N' : 'S';
  const ew = lonFloor >= 0 ? 'E' : 'W';
  const latCode = String(Math.abs(latFloor)).padStart(2, '0');
  const lonCode = String(Math.abs(lonFloor)).padStart(3, '0');
  const tile = `Copernicus_DSM_COG_30_${ns}${latCode}_00_${ew}${lonCode}_00_DEM`;
  return `${COPERNICUS_DEM_90M}/${tile}/${tile}.tif`;
}

async function loadDemTile(geotiff, lonFloor) {
  const tiff = await geotiff.fromUrl(copernicusTileUrl(SITE.lat, lonFloor + 0.1));
  const image = await tiff.getImage();
  const imageBbox = image.getBoundingBox();
  const bbox = [
    Math.max(DEM_BBOX.west, imageBbox[0]),
    Math.max(DEM_BBOX.south, imageBbox[1]),
    Math.min(DEM_BBOX.east, imageBbox[2]),
    Math.min(DEM_BBOX.north, imageBbox[3]),
  ];
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return null;
  const width = 72;
  const height = 72;
  const values = await image.readRasters({ bbox, width, height, resampleMethod: 'bilinear', interleave: true });
  return { bbox, width, height, values };
}

async function loadCopernicusDem() {
  setDemStatus('DEM: model 512 działa • pobieranie Copernicus GLO-90…');
  try {
    const geotiff = await import(GEOTIFF_MODULE_URL);
    const tileFloors = [...new Set([Math.floor(DEM_BBOX.west), Math.floor(DEM_BBOX.east)])];
    const loaded = await Promise.all(tileFloors.map((lonFloor) => loadDemTile(geotiff, lonFloor)));
    demTiles.length = 0;
    loaded.filter(Boolean).forEach((tile) => demTiles.push(tile));
    if (!demTiles.length) throw new Error('Brak kafli DEM w obszarze laboratorium.');
    demReady = true;
    const centerSample = demMetersAt(0, 0);
    siteElevationM = Number.isFinite(centerSample) ? centerSample : 0;
    updateTerrain();
    updateWaterAndVegetation();
    setDemStatus(`DEM Copernicus GLO-90: OK • punkt ${fmt(siteElevationM, 0)} m n.p.m. • GRID 512 aktywny`, 'ok');
  } catch (error) {
    demReady = false;
    demTiles.length = 0;
    siteElevationM = null;
    updateTerrain();
    setDemStatus('DEM Copernicus chwilowo niedostępny • działa bezpieczny teren lokalny + pełny GRID 512', 'error');
    console.warn('Copernicus DEM fallback:', error);
  }
}

async function installTransformControls() {
  try {
    const module = await import('three/addons/controls/TransformControls.js');
    const TransformControls = module.TransformControls;
    transform = new TransformControls(camera, renderer.domElement);
    transform.setMode('translate');
    transform.setSize(0.82);
    transform.showY = false;
    scene.add(transform.getHelper ? transform.getHelper() : transform);
    transform.addEventListener('dragging-changed', (event) => {
      transformDragging = event.value;
      orbit.enabled = !event.value;
    });
    transform.addEventListener('objectChange', () => {
      if (!selected) return;
      selected.position.x = clamp(selected.position.x, -WORLD_LIMIT, WORLD_LIMIT);
      selected.position.z = clamp(selected.position.z, -WORLD_LIMIT, WORLD_LIMIT);
      if (selected.userData.kind === 'valley') updateTerrain();
      else selected.position.y = terrainHeightAt(selected.position.x, selected.position.z);
      updateHostedTrees();
      updateSelectionHud();
      updateGridOccupancy();
    });
    if (selected) transform.attach(selected);
  } catch (error) {
    console.warn('TransformControls niedostępny; obrót kamery i wybór nadal działają.', error);
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
    const hits = raycaster.intersectObject(terrain, false);
    if (hits.length) {
      createTree(hits[0].point.x, hits[0].point.z);
      updateMetrics();
      updateWaterAndVegetation();
      setMessage(`Dodano drzewo ${Number($('treeHeight')?.value ?? 6)} m.`, 'ok');
      return;
    }
  }
  const pickables = [];
  for (const object of objects) {
    object.traverse((child) => { if (child.isMesh && child.userData.owner) pickables.push(child); });
  }
  const hits = raycaster.intersectObjects(pickables, false);
  if (hits.length) selectObject(hits[0].object.userData.owner);
});

function resize() {
  const width = Math.max(viewer.clientWidth, 1);
  const height = Math.max(viewer.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

bind('baseSize', 'input', updateShapeOutputs);
bind('topSize', 'input', updateShapeOutputs);
bind('heightSize', 'input', updateShapeOutputs);
bind('digValley', 'click', () => digValley());
bind('buildMountain', 'click', () => buildMountain());
bind('createPair', 'click', () => createPair());
bind('duplicateSelected', 'click', duplicateSelected);
bind('deleteSelected', 'click', deleteSelected);
bind('snapSelected', 'click', snapSelected);
bind('sunAzimuth', 'input', updateSun);
bind('sunElevation', 'input', updateSun);
bind('rotateLeft', 'click', () => rotateSelected(-5));
bind('rotateRight', 'click', () => rotateSelected(5));
bind('optimizeShade', 'click', optimizeShade);
bind('maxShadePreset', 'click', () => {
  if ($('sunElevation')) $('sunElevation').value = '10';
  if ($('sunAzimuth')) $('sunAzimuth').value = '225';
  updateSun();
  setMessage('Preset długiego cienia: Słońce 10° nad horyzontem.', 'ok');
});
bind('rainScenario', 'input', () => {
  if ($('rainOut')) $('rainOut').textContent = `${$('rainScenario').value}%`;
  updateWaterAndVegetation();
});
bind('treeHeight', 'input', () => {
  if ($('treeHeightOut')) $('treeHeightOut').textContent = `${$('treeHeight').value} m`;
});
bind('plantMode', 'click', () => {
  plantingMode = !plantingMode;
  $('plantMode')?.classList.toggle('active', plantingMode);
  if ($('plantMode')) $('plantMode').textContent = `+ Sadź drzewka: ${plantingMode ? 'WŁ.' : 'WYŁ.'}`;
});
bind('plantSelectedValley', 'click', () => plantAtSelectedValley(100));
bind('clearTrees', 'click', clearTrees);
bind('advanceScenario', 'click', () => {
  scenarioStage = Math.min(10, scenarioStage + 1);
  updateWaterAndVegetation();
  setMessage(`Etap retencji: ${scenarioStage}/10.`, 'ok');
});
bind('showWater', 'change', updateWaterAndVegetation);
bind('showChannel', 'change', (event) => {
  channelEnabled = event.target.checked;
  channelVisual.visible = channelEnabled;
  updateTerrain();
});
bind('showGrid', 'change', (event) => {
  gridRoot.visible = event.target.checked;
  setMessage(event.target.checked ? 'Silnik przestrzenny 512: widoczne 8 warstw po 64 pola.' : 'Silnik 512 liczy komórki, ale warstwy są ukryte.', 'ok');
});
bind('resetScene', 'click', resetDemo);

window.addEventListener('resize', resize);
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewer);

updateShapeOutputs();
updateSun();
seedInitialSaharaScene();
resize();
animate();
installTransformControls();
window.setTimeout(loadCopernicusDem, 250);
