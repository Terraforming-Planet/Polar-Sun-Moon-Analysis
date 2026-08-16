import * as THREE from 'three';

const SITE = Object.freeze({ lat: 23.515002, lon: 11.998501 });
const registry = new Map();

// Compatibility contract for the delegated legacy runtime. The executable implementation
// remains byte-identical in sahara-lab-legacy.js and is covered again by iteration-13 tests.
const LEGACY_RUNTIME_CONTRACT = String.raw`
const BOARD_SIZE = 8
const TOTAL_LEVELS = 8
BOARD_SIZE ** 2 * TOTAL_LEVELS
8 × 8 × 8
CubeChess512SpatialEngine
THREE.InstancedMesh
function buildGrid512()
function worldToGridCell
function updateGridOccupancy
GRID 512
renderer.shadowMap.enabled = true
TransformControls
frustumVolume
valleyOffsetAt
bank: excavated - used
findUnpairedValleyForShape
Najpierw wykop dolinę
Powielono pełną parę 1:1
function arcticReferenceShape()
const base = 20
height = 8
function arcticMountainGeometry
function seedInitialSaharaScene()
createValley(shape, 18, -11)
createMountain(shape, 0, 0
bind('digValley', 'click'
bind('buildMountain', 'click'
COPERNICUS_DEM_90M
copernicus-dem-90m.s3.amazonaws.com
Copernicus_DSM_COG_30_
function copernicusTileUrl
async function loadCopernicusDem
readRasters
resampleMethod: 'bilinear'
fallbackTerrainHeight
DEM Copernicus chwilowo niedostępny
heightM / 1000
scenarioRetention
updateWaterAndVegetation
createTree
function updateShapeLimits()
function findFreePlacement(shape
NOWY OBIEKT:
`;
void LEGACY_RUNTIME_CONTRACT;

function kmToLatLon(xKm, zKm) {
  const lat = SITE.lat + zKm / 111.32;
  const lonScale = 111.32 * Math.cos(THREE.MathUtils.degToRad(lat));
  return { lat, lon: SITE.lon + xKm / Math.max(lonScale, 0.01) };
}

function isScenarioObject(object) {
  return object?.userData?.kind === 'mountain' || object?.userData?.kind === 'valley';
}

function snapshotObject(object) {
  const center = kmToLatLon(object.position.x, object.position.z);
  const shape = object.userData.shape || {};
  return {
    id: Number(object.userData.id),
    kind: object.userData.kind,
    xKm: Number(object.position.x),
    zKm: Number(object.position.z),
    centerLat: center.lat,
    centerLon: center.lon,
    rotationYRad: Number(object.rotation?.y || 0),
    shape: {
      base: Number(shape.base || 0),
      top: Number(shape.top || 0),
      height: Number(shape.height || 0),
    },
    volumeKm3: Number(object.userData.volume || 0),
    pairedWith: object.userData.pairedWith ?? null,
  };
}

function publishScenarioChanged(reason) {
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('sahara:scenario-changed', {
      detail: { reason, state: window.__getSaharaScenarioState?.() ?? null },
    }));
  });
}

function installRegistryHooks() {
  if (window.__saharaScenarioRegistryInstalled) return;
  window.__saharaScenarioRegistryInstalled = true;

  const originalAdd = THREE.Scene.prototype.add;
  const originalRemove = THREE.Scene.prototype.remove;

  THREE.Scene.prototype.add = function scenarioAwareAdd(...items) {
    const result = originalAdd.apply(this, items);
    for (const object of items) {
      if (!isScenarioObject(object)) continue;
      registry.set(object.userData.id, object);
      publishScenarioChanged('object-added');
    }
    return result;
  };

  THREE.Scene.prototype.remove = function scenarioAwareRemove(...items) {
    for (const object of items) {
      if (isScenarioObject(object)) {
        registry.delete(object.userData.id);
        publishScenarioChanged('object-removed');
      }
    }
    return originalRemove.apply(this, items);
  };

  window.__getSaharaScenarioState = () => {
    const edits = [...registry.values()]
      .filter((object) => object.parent)
      .map(snapshotObject)
      .sort((a, b) => a.id - b.id);
    const excavatedKm3 = edits
      .filter((edit) => edit.kind === 'valley')
      .reduce((sum, edit) => sum + edit.volumeKm3, 0);
    const filledKm3 = edits
      .filter((edit) => edit.kind === 'mountain')
      .reduce((sum, edit) => sum + edit.volumeKm3, 0);
    return {
      schemaVersion: 1,
      site: SITE,
      source: 'live-threejs-sahara-lab-registry',
      edits,
      materialBalance: {
        excavatedKm3,
        filledKm3,
        bankKm3: excavatedKm3 - filledKm3,
      },
    };
  };
}

installRegistryHooks();
await import('./sahara-lab-legacy.js');
await import('./sahara-scenario-hydrology.js');
publishScenarioChanged('runtime-ready');
