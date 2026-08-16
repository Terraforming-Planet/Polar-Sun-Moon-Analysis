import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RegionalDemOverlay } from './sahara-dem-relief.js';

const host = document.getElementById('planetViewer');
const status = document.getElementById('planetStatus');

if (host) {
  const SITE = { lat: 23.515002, lon: 11.998501 };
  const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
  const GIBS_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor';
  const GIBS_DATE = host.dataset.imageryDate || '2026-08-12';
  const radius = 5.15;
  const tileRoot = new THREE.Group();
  const textureCache = new Map();
  let activeLod = -1;
  let buildGeneration = 0;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x02060c, 1);
  renderer.domElement.setAttribute('aria-label', 'Kafelkowy model 3D Ziemi z NASA GIBS i regionalnym Copernicus DEM');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  camera.position.set(0, 1.8, 13.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 6.4;
  controls.maxDistance = 26;
  controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0x7aa6d8, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.position.set(7, 4, 9);
  scene.add(sun);
  scene.add(tileRoot);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.015, 72, 48),
    new THREE.MeshBasicMaterial({ color: 0x6db7ff, transparent: true, opacity: 0.08, side: THREE.BackSide }),
  );
  scene.add(atmosphere);

  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  const demOverlay = new RegionalDemOverlay(scene, radius, status);

  const places = {
    sahara: { lat: SITE.lat, lon: SITE.lon, label: 'Sahara Station' },
    himalaya: { lat: 28.0, lon: 86.0, label: 'Himalaje / Tybet' },
    deathvalley: { lat: 36.25, lon: -116.82, label: 'Death Valley' },
    bonneville: { lat: 40.75, lon: -113.8, label: 'Bonneville / Great Salt Desert' },
    ebro: { lat: 41.65, lon: -0.85, label: 'Ebro / Aragón' },
    po: { lat: 45.05, lon: 9.7, label: 'Po River' },
    tanezrouft: { lat: 25.0, lon: 0.5, label: 'Tanezrouft' },
    tsauchab: { lat: -24.75, lon: 15.35, label: 'Tsauchab / Sossusvlei' },
    lopnur: { lat: 40.3, lon: 90.5, label: 'Lop Nur' },
    aral: { lat: 44.5, lon: 59.5, label: 'Aral' },
  };

  function gibsTileUrl(west, south, east, north) {
    const params = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
      LAYERS: GIBS_LAYER, STYLES: '', FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE',
      SRS: 'EPSG:4326', BBOX: `${west},${south},${east},${north}`,
      WIDTH: '512', HEIGHT: '512', TIME: GIBS_DATE,
    });
    return `${GIBS_WMS}?${params.toString()}`;
  }

  function loadTexture(url) {
    if (textureCache.has(url)) return textureCache.get(url);
    const promise = new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      }, undefined, () => resolve(null));
    });
    textureCache.set(url, promise);
    return promise;
  }

  function disposeTiles() {
    for (const mesh of [...tileRoot.children]) {
      tileRoot.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
  }

  async function createTile(west, south, east, north, segments, generation) {
    const texture = await loadTexture(gibsTileUrl(west, south, east, north));
    if (generation !== buildGeneration) return false;
    const geometry = new THREE.SphereGeometry(
      radius,
      segments,
      Math.max(4, Math.floor(segments / 2)),
      THREE.MathUtils.degToRad(west + 180),
      THREE.MathUtils.degToRad(east - west),
      THREE.MathUtils.degToRad(90 - north),
      THREE.MathUtils.degToRad(north - south),
    );
    const material = new THREE.MeshStandardMaterial({
      map: texture || null,
      color: texture ? 0xffffff : 0x355269,
      roughness: 0.9,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { west, south, east, north };
    mesh.frustumCulled = true;
    tileRoot.add(mesh);
    return true;
  }

  async function buildLod(lod) {
    if (lod === activeLod) return;
    activeLod = lod;
    const generation = ++buildGeneration;
    disposeTiles();
    const lonStep = lod === 0 ? 90 : 45;
    const latStep = lod === 0 ? 45 : 30;
    const segments = lod === 0 ? 12 : 18;
    const jobs = [];
    for (let south = -90; south < 90; south += latStep) {
      const north = Math.min(90, south + latStep);
      for (let west = -180; west < 180; west += lonStep) {
        jobs.push([west, south, Math.min(180, west + lonStep), north]);
      }
    }
    if (status) status.textContent = `NASA GIBS ${GIBS_DATE}: LOD ${lod} • ładowanie ${jobs.length} kafelków…`;
    let loaded = 0;
    const batchSize = 6;
    for (let offset = 0; offset < jobs.length; offset += batchSize) {
      if (generation !== buildGeneration) return;
      const batch = jobs.slice(offset, offset + batchSize);
      const results = await Promise.all(batch.map((job) => createTile(...job, segments, generation)));
      loaded += results.filter(Boolean).length;
      if (status) status.textContent = `NASA GIBS ${GIBS_DATE}: LOD ${lod} • ${loaded}/${jobs.length} kafelków`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (status) status.textContent = `NASA GIBS ${GIBS_DATE}: LOD ${lod} gotowy • ${jobs.length} kafelków • cache aktywny`;
  }

  function latLonToVector(lat, lon, r = radius) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon + 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }

  function focusPlace(placeKey = 'sahara') {
    const place = places[placeKey] ?? places.sahara;
    const point = latLonToVector(place.lat, place.lon, radius * 1.03);
    markerGroup.clear();
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xff4d43 }),
    );
    pin.position.copy(point);
    markerGroup.add(pin);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      point.clone().multiplyScalar(0.995),
      point.clone().multiplyScalar(1.12),
    ]);
    markerGroup.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xffc65b })));
    camera.position.copy(point.clone().normalize().multiplyScalar(8.4));
    controls.target.set(0, 0, 0);
    controls.update();
    if (status) status.textContent = `${place.label}: ${place.lat.toFixed(3)}°, ${place.lon.toFixed(3)}° • NASA GIBS + Copernicus DEM`;
    void demOverlay.setPlace(place);
  }

  function bindPlaceButtons() {
    const existingButtons = [...document.querySelectorAll('[data-globe-place]')];
    existingButtons.forEach((button) => {
      button.addEventListener('click', () => focusPlace(button.dataset.globePlace));
    });
    const buttonHost = existingButtons[0]?.parentElement;
    if (!buttonHost) return;
    const extraKeys = ['bonneville', 'ebro', 'po', 'tanezrouft', 'tsauchab'];
    for (const key of extraKeys) {
      if (buttonHost.querySelector(`[data-globe-place="${key}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.globePlace = key;
      button.textContent = places[key].label;
      button.addEventListener('click', () => focusPlace(key));
      buttonHost.appendChild(button);
    }
  }

  function resize() {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const nextLod = camera.position.length() < 9.0 ? 1 : 0;
    if (nextLod !== activeLod) void buildLod(nextLod);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  bindPlaceButtons();
  resize();
  focusPlace('sahara');
  void buildLod(0);
  animate();
}
