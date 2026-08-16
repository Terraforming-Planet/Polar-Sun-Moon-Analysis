import * as THREE from 'three';

const COPERNICUS_DEM_90M = 'https://copernicus-dem-90m.s3.amazonaws.com';
const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';
const EARTH_RADIUS_KM = 6371.0;
const SAMPLE_SIZE = 33;

function tileCode(lat, lon) {
  const latFloor = Math.floor(lat);
  const lonFloor = Math.floor(lon);
  const latHemisphere = latFloor >= 0 ? 'N' : 'S';
  const lonHemisphere = lonFloor >= 0 ? 'E' : 'W';
  const latCode = `${latHemisphere}${String(Math.abs(latFloor)).padStart(2, '0')}_00`;
  const lonCode = `${lonHemisphere}${String(Math.abs(lonFloor)).padStart(3, '0')}_00`;
  return `${latCode}_${lonCode}`;
}

export function copernicusDemTileUrl(lat, lon) {
  const code = tileCode(lat, lon);
  const name = `Copernicus_DSM_COG_30_${code}_DEM`;
  return `${COPERNICUS_DEM_90M}/${name}/${name}.tif`;
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

export class RegionalDemOverlay {
  constructor(scene, radius, statusElement = null) {
    this.radius = radius;
    this.status = statusElement;
    this.group = new THREE.Group();
    this.group.name = 'copernicus-dem-regional-relief';
    scene.add(this.group);
    this.cache = new Map();
    this.generation = 0;
    this.verticalExaggeration = 24;
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  async loadSamples(lat, lon) {
    const url = copernicusDemTileUrl(lat, lon);
    if (this.cache.has(url)) return this.cache.get(url);
    const promise = (async () => {
      const { fromUrl } = await import(GEOTIFF_MODULE_URL);
      const tiff = await fromUrl(url);
      const image = await tiff.getImage();
      const values = await image.readRasters({
        width: SAMPLE_SIZE,
        height: SAMPLE_SIZE,
        interleave: true,
        resampleMethod: 'bilinear',
      });
      return { values, url, latFloor: Math.floor(lat), lonFloor: Math.floor(lon) };
    })();
    this.cache.set(url, promise);
    return promise;
  }

  buildGeometry(sample) {
    const { values, latFloor, lonFloor } = sample;
    const positions = [];
    const colors = [];
    const indices = [];
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (let row = 0; row < SAMPLE_SIZE; row += 1) {
      const lat = latFloor + 1 - row / (SAMPLE_SIZE - 1);
      for (let col = 0; col < SAMPLE_SIZE; col += 1) {
        const lon = lonFloor + col / (SAMPLE_SIZE - 1);
        const elevationM = finiteElevation(Number(values[row * SAMPLE_SIZE + col]));
        minElevation = Math.min(minElevation, elevationM);
        maxElevation = Math.max(maxElevation, elevationM);
        const physicalOffset = this.radius * (elevationM / 1000) / EARTH_RADIUS_KM;
        const displayRadius = this.radius + physicalOffset * this.verticalExaggeration + 0.008;
        const point = latLonToVector(lat, lon, displayRadius);
        positions.push(point.x, point.y, point.z);
        const normalized = THREE.MathUtils.clamp((elevationM + 200) / 5200, 0, 1);
        colors.push(0.30 + normalized * 0.55, 0.34 + normalized * 0.42, 0.18 + normalized * 0.36);
      }
    }

    for (let row = 0; row < SAMPLE_SIZE - 1; row += 1) {
      for (let col = 0; col < SAMPLE_SIZE - 1; col += 1) {
        const a = row * SAMPLE_SIZE + col;
        const b = a + 1;
        const c = a + SAMPLE_SIZE;
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

  async setPlace(place) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
    const generation = ++this.generation;
    this.clear();
    if (this.status) {
      this.status.textContent = `${place.label}: pobieranie regionalnego Copernicus DEM GLO-90…`;
    }
    try {
      const sample = await this.loadSamples(place.lat, place.lon);
      if (generation !== this.generation) return;
      const geometry = this.buildGeometry(sample);
      const surface = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.46,
          roughness: 1,
          metalness: 0,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      surface.frustumCulled = true;
      this.group.add(surface);

      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.12 }),
      );
      wire.frustumCulled = true;
      this.group.add(wire);

      const { minElevation, maxElevation } = geometry.userData;
      if (this.status) {
        this.status.textContent = `${place.label} • Copernicus DEM GLO-90: ${Math.round(minElevation)}–${Math.round(maxElevation)} m • relief ×${this.verticalExaggeration} dla czytelności`;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.cache.delete(copernicusDemTileUrl(place.lat, place.lon));
      if (this.status) {
        this.status.textContent = `${place.label}: obraz NASA działa • regionalny DEM chwilowo niedostępny (${error?.message || 'błąd sieci'})`;
      }
    }
  }
}
