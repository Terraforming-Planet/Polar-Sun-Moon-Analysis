import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host = document.getElementById('planetViewer');
const status = document.getElementById('planetStatus');

if (host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Globalny model 3D Ziemi z obrazem satelitarnym NASA GIBS');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060c);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  camera.position.set(0, 1.8, 13.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 7.2;
  controls.maxDistance = 26;
  controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0x7aa6d8, 0.72));
  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.position.set(7, 4, 9);
  scene.add(sun);

  const radius = 5.15;
  const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x456b88, roughness: 0.88, metalness: 0 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), earthMaterial);
  earth.rotation.y = -Math.PI / 2;
  scene.add(earth);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.015, 72, 48),
    new THREE.MeshBasicMaterial({ color: 0x6db7ff, transparent: true, opacity: 0.08, side: THREE.BackSide }),
  );
  scene.add(atmosphere);

  const markerGroup = new THREE.Group();
  scene.add(markerGroup);

  const places = {
    sahara: { lat: 23.515002, lon: 11.998501, label: 'Sahara Station' },
    himalaya: { lat: 28.0, lon: 86.0, label: 'Himalaje / Tybet' },
    lopnur: { lat: 40.3, lon: 90.5, label: 'Lop Nur' },
  };

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

    const direction = point.clone().normalize();
    camera.position.copy(direction.multiplyScalar(12.2));
    controls.target.set(0, 0, 0);
    controls.update();
    if (status) status.textContent = `${place.label}: ${place.lat.toFixed(3)}°, ${place.lon.toFixed(3)}° • NASA GIBS + lokalny Copernicus DEM`;
  }

  const snapshotUrl = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2024-08-01T00:00:00Z&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&WIDTH=2048&HEIGHT=1024';
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    snapshotUrl,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      earthMaterial.map = texture;
      earthMaterial.color.setHex(0xffffff);
      earthMaterial.needsUpdate = true;
      if (status) status.textContent = 'NASA GIBS MODIS: załadowano prawdziwy obraz satelitarny • punkt Sahara zsynchronizowany z laboratorium DEM';
    },
    undefined,
    () => {
      if (status) status.textContent = 'NASA GIBS chwilowo niedostępny • glob 3D działa w trybie awaryjnym, lokalny Copernicus DEM pozostaje aktywny';
    },
  );

  document.querySelectorAll('[data-globe-place]').forEach((button) => {
    button.addEventListener('click', () => focusPlace(button.dataset.globePlace));
  });

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
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  resize();
  focusPlace('sahara');
  animate();
}
