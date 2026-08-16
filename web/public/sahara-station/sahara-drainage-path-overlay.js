import * as THREE from 'three';

function latLonToVector(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export class DrainagePathComparisonOverlay {
  constructor(scene, radius) {
    this.radius = radius;
    this.group = new THREE.Group();
    this.group.name = 'drainage-path-comparison-overlay';
    scene.add(this.group);
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  addPath(path, color, radiusOffset, name) {
    if (!Array.isArray(path) || path.length < 2) return;
    const points = path.map((point) => latLonToVector(point.lat, point.lon, this.radius + radiusOffset));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.96 });
    const line = new THREE.Line(geometry, material);
    line.name = name;
    this.group.add(line);
  }

  addEndpoint(point, color, radiusOffset, name) {
    if (!point) return;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    marker.position.copy(latLonToVector(point.lat, point.lon, this.radius + radiusOffset));
    marker.name = name;
    this.group.add(marker);
  }

  show(result) {
    this.clear();
    this.addPath(result.singlePath, 0xffd36a, 0.055, 'principal-drainage-path-1deg');
    this.addPath(result.mosaicPath, 0x4fe3ff, 0.070, 'principal-drainage-path-3deg');
    this.addEndpoint(result.singlePath?.at(-1), 0xffa92f, 0.075, 'drainage-outlet-1deg');
    this.addEndpoint(result.mosaicPath?.at(-1), 0x20c4ff, 0.090, 'drainage-outlet-3deg');
  }
}
