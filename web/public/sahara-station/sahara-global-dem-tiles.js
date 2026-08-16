import * as THREE from 'three';

const COPERNICUS_DEM_90M = 'https://copernicus-dem-90m.s3.amazonaws.com';
const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';
const EARTH_RADIUS_KM = 6371.0;
const LOD_LEVELS = [
  { id: 0, sampleSize: 9, label: 'coarse' },
  { id: 1, sampleSize: 17, label: 'detail' },
];
const BATCH_SIZE = 3;

function wrapLongitude(value) {
  let lon = value;
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;
  return lon;
}

function clampLatitudeTile(value) {
  return Math.max(-90, Math.min(89, value));
}

function tileCode(latFloor, lonFloor) {
  const latHemisphere = latFloor >= 0 ? 'N' : 'S';
  const lonHemisphere = lonFloor >= 0 ? 'E' : 'W';
  const latCode = `${latHemisphere}${String(Math.abs(latFloor)).padStart(2, '0')}_00`;
  const lonCode = `${lonHemisphere}${String(Math.abs(lonFloor)).padStart(3, '0')}_00`;
  return `${latCode}_${lonCode}`;
}

export function globalDemTileUrl(latFloor, lonFloor) {
  const lat = clampLatitudeTile(Math.floor(latFloor));
  const lon = Math.floor(wrapLongitude(lonFloor));
  const code = tileCode(lat, lon);
  const name = `Copernicus_DSM_COG_30_${code}_DEM`;
  return `${COPERNICUS_DEM_90M}/${name}/${name}.tif`;
}

export function globalDemNeighborhood(lat, lon, radiusTiles = 1) {
  const centerLat = clampLatitudeTile(Math.floor(lat));
  const centerLon = Math.floor(wrapLongitude(lon));
  const tiles = [];
  const seen = new Set();
  for (let dy = -radiusTiles; dy <= radiusTiles; dy += 1) {
    const latFloor = clampLatitudeTile(centerLat + dy);
    for (let dx = -radiusTiles; dx <= radiusTiles; dx += 1) {
      const lonFloor = Math.floor(wrapLongitude(centerLon + dx));
      const key = `${latFloor}:${lonFloor}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push({ latFloor, lonFloor, key });
    }
  }
  return tiles;
}

function latLonToVector(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function finiteElevation(value) {
  if (!Number.isFinite(value) || Math.abs(value) > 12000) return 0;
  return THREE.MathUtils.clamp(value, -500, 9000);
}

function disposeGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
}

export class GlobalDemTileEngine {
  constructor(scene, radius, statusElement = null) {
    this.scene = scene;
    this.radius = radius;
    this.status = statusElement;
    this.group = new THREE.Group();
    this.group.name = 'copernicus-dem-global-tile-engine';
    this.scene.add(this.group);
    this.sampleCache = new Map();
    this.focus = null;
    this.activeLod = -1;
    this.generation = 0;
    this.verticalExaggeration = 24;
    this.lastCameraDistance = Infinity;
  }

  displayRadius(elevationM, extra = 0.010) {
    const physicalOffset = this.radius * (elevationM / 1000) / EARTH_RADIUS_KM;
    return this.radius + physicalOffset * this.verticalExaggeration + extra;
  }

  async loadTile(tile, sampleSize) {
    const url = globalDemTileUrl(tile.latFloor, tile.lonFloor);
    const cacheKey = `${url}#${sampleSize}`;
    if (this.sampleCache.has(cacheKey)) return this.sampleCache.get(cacheKey);
    const promise = (async () => {
      const { fromUrl } = await import(GEOTIFF_MODULE_URL);
      const tiff = await fromUrl(url);
      const image = await tiff.getImage();
      const values = await image.readRasters({
        width: sampleSize,
        height: sampleSize,
        interleave: true,
        resampleMethod: 'bilinear',
      });
      return { ...tile, values, sampleSize, url };
    })();
    this.sampleCache.set(cacheKey, promise);
    try {
      return await promise;
    } catch (error) {
      this.sampleCache.delete(cacheKey);
      throw error;
    }
  }

  buildGeometry(sample) {
    const { values, latFloor, lonFloor, sampleSize } = sample;
    const positions = [];
    const colors = [];
    const indices = [];
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (let row = 0; row < sampleSize; row += 1) {
      const lat = latFloor + 1 - row / (sampleSize - 1);
      for (let col = 0; col < sampleSize; col += 1) {
        const lon = lonFloor + col / (sampleSize - 1);
        const elevationM = finiteElevation(Number(values[row * sampleSize + col]));
        minElevation = Math.min(minElevation, elevationM);
        maxElevation = Math.max(maxElevation, elevationM);
        const point = latLonToVector(lat, lon, this.displayRadius(elevationM));
        positions.push(point.x, point.y, point.z);
        const normalized = THREE.MathUtils.clamp((elevationM + 300) / 6000, 0, 1);
        colors.push(
          0.23 + normalized * 0.52,
          0.30 + normalized * 0.46,
          0.20 + normalized * 0.34,
        );
      }
    }

    for (let row = 0; row < sampleSize - 1; row += 1) {
      for (let col = 0; col < sampleSize - 1; col += 1) {
        const a = row * sampleSize + col;
        const b = a + 1;
        const c = a + sampleSize;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData = { minElevation, maxElevation };
    return geometry;
  }

  createMesh(sample) {
    const geometry = this.buildGeometry(sample);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `global-dem-${sample.latFloor}-${sample.lonFloor}`;
    mesh.userData = {
      latFloor: sample.latFloor,
      lonFloor: sample.lonFloor,
      sampleSize: sample.sampleSize,
      url: sample.url,
      ...geometry.userData,
    };
    mesh.frustumCulled = true;
    return mesh;
  }

  lodForDistance(cameraDistance) {
    return cameraDistance < 8.8 ? 1 : 0;
  }

  async rebuild(cameraDistance = this.lastCameraDistance) {
    if (!this.focus) return;
    this.lastCameraDistance = cameraDistance;
    const lod = this.lodForDistance(cameraDistance);
    const config = LOD_LEVELS[lod];
    const generation = ++this.generation;
    const staging = new THREE.Group();
    staging.name = `copernicus-dem-staging-lod-${lod}`;
    const jobs = globalDemNeighborhood(this.focus.lat, this.focus.lon, 1);
    let loaded = 0;
    let failed = 0;

    if (this.status) {
      this.status.textContent = `${this.focus.label}: globalny DEM LOD ${lod} • ładowanie ${jobs.length} kafelków 1°…`;
    }

    for (let offset = 0; offset < jobs.length; offset += BATCH_SIZE) {
      if (generation !== this.generation) {
        disposeGroup(staging);
        return;
      }
      const batch = jobs.slice(offset, offset + BATCH_SIZE);
      // Public COGs are loaded in small batches so switching locations remains responsive.
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.allSettled(batch.map((tile) => this.loadTile(tile, config.sampleSize)));
      for (const result of results) {
        if (result.status === 'fulfilled') {
          staging.add(this.createMesh(result.value));
          loaded += 1;
        } else {
          failed += 1;
        }
      }
      if (this.status && generation === this.generation) {
        this.status.textContent = `${this.focus.label}: globalny DEM LOD ${lod} • ${loaded}/${jobs.length} kafelków • błędy ${failed}`;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (generation !== this.generation) {
      disposeGroup(staging);
      return;
    }
    disposeGroup(this.group);
    for (const mesh of [...staging.children]) {
      staging.remove(mesh);
      this.group.add(mesh);
    }
    this.activeLod = lod;
    if (this.status) {
      this.status.textContent = `${this.focus.label}: Copernicus DEM 3×3 gotowy • LOD ${lod}/${config.label} • ${loaded} kafelków • cache ${this.sampleCache.size} • relief ×${this.verticalExaggeration}`;
    }
  }

  async setFocus(place, cameraDistance = this.lastCameraDistance) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
    const previousLat = this.focus?.lat;
    const previousLon = this.focus?.lon;
    this.focus = { ...place };
    const movedTile = Math.floor(previousLat ?? 999) !== Math.floor(place.lat)
      || Math.floor(previousLon ?? 999) !== Math.floor(place.lon);
    const nextLod = this.lodForDistance(cameraDistance);
    if (movedTile || nextLod !== this.activeLod) await this.rebuild(cameraDistance);
  }

  updateForCamera(cameraDistance) {
    this.lastCameraDistance = cameraDistance;
    const nextLod = this.lodForDistance(cameraDistance);
    if (this.focus && nextLod !== this.activeLod) void this.rebuild(cameraDistance);
  }

  clear() {
    this.generation += 1;
    disposeGroup(this.group);
    this.activeLod = -1;
  }
}
