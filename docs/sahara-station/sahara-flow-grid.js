import {
  computeFlowAccumulation,
  delineateWatershed,
  finiteElevation,
} from './sahara-flow-core.js';

const EARTH_RADIUS_M = 6371000;
const FLAT_EPSILON_M = 0.001;
const D8_NEIGHBORS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function pushHeap(heap, item) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent][0] <= item[0]) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function popHeap(heap) {
  if (heap.length === 0) return null;
  const root = heap[0];
  const last = heap.pop();
  if (heap.length === 0) return root;
  let index = 0;
  while (true) {
    let child = index * 2 + 1;
    if (child >= heap.length) break;
    if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child += 1;
    if (heap[child][0] >= last[0]) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return root;
}

function gridDistances(lat, width, height, latSpanDeg, lonSpanDeg) {
  const dLat = Math.PI / 180 * latSpanDeg / Math.max(1, height - 1);
  const dLon = Math.PI / 180 * lonSpanDeg / Math.max(1, width - 1);
  return {
    northSouth: EARTH_RADIUS_M * dLat,
    eastWest: Math.max(1, Math.abs(EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180) * dLon)),
  };
}

function boundaryIndices(width, height) {
  const indices = [];
  for (let col = 0; col < width; col += 1) {
    indices.push(col, (height - 1) * width + col);
  }
  for (let row = 1; row < height - 1; row += 1) {
    indices.push(row * width, row * width + width - 1);
  }
  return indices;
}

function conditionGrid(elevations, width, height, epsilonM) {
  const conditioned = Float64Array.from(elevations);
  const fillDepth = new Float64Array(elevations.length);
  const visited = new Uint8Array(elevations.length);
  const heap = [];
  for (const index of boundaryIndices(width, height)) {
    if (visited[index]) continue;
    visited[index] = 1;
    pushHeap(heap, [conditioned[index], index]);
  }
  while (heap.length > 0) {
    const item = popHeap(heap);
    if (!item) break;
    const [spill, index] = item;
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [dr, dc] of D8_NEIGHBORS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const neighbor = nr * width + nc;
      if (visited[neighbor]) continue;
      visited[neighbor] = 1;
      const minimumDrainable = spill + epsilonM;
      if (conditioned[neighbor] <= spill) {
        conditioned[neighbor] = minimumDrainable;
        fillDepth[neighbor] = Math.max(0, minimumDrainable - elevations[neighbor]);
      }
      pushHeap(heap, [conditioned[neighbor], neighbor]);
    }
  }
  return { conditioned, fillDepth };
}

function computeGridReceivers(elevations, width, height, distances) {
  const receivers = new Int32Array(elevations.length);
  receivers.fill(-1);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      let bestReceiver = -1;
      let bestGradient = 0;
      for (const [dr, dc] of D8_NEIGHBORS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const neighbor = nr * width + nc;
        const drop = elevations[index] - elevations[neighbor];
        if (drop <= 0) continue;
        const distance = Math.hypot(dr * distances.northSouth, dc * distances.eastWest);
        const gradient = drop / distance;
        if (gradient > bestGradient) {
          bestGradient = gradient;
          bestReceiver = neighbor;
        }
      }
      receivers[index] = bestReceiver;
    }
  }
  return receivers;
}

function isBoundary(index, width, height) {
  const row = Math.floor(index / width);
  const col = index % width;
  return row === 0 || col === 0 || row === height - 1 || col === width - 1;
}

export function buildMosaicFlowProducts(mosaic, lat, epsilonM = FLAT_EPSILON_M) {
  const { width, height, latSpanDeg, lonSpanDeg } = mosaic;
  const elevations = Array.from(mosaic.values, (value) => finiteElevation(Number(value)));
  if (elevations.length !== width * height) {
    throw new Error(`Expected ${width * height} mosaic samples, got ${elevations.length}`);
  }
  const conditioned = conditionGrid(elevations, width, height, epsilonM);
  const distances = gridDistances(lat, width, height, latSpanDeg, lonSpanDeg);
  const receivers = computeGridReceivers(conditioned.conditioned, width, height, distances);
  const accumulation = computeFlowAccumulation(receivers);
  let dominantOutlet = 0;
  for (let index = 1; index < accumulation.length; index += 1) {
    if (accumulation[index] > accumulation[dominantOutlet]) dominantOutlet = index;
  }
  const watershed = delineateWatershed(receivers, dominantOutlet);
  let filledCellCount = 0;
  let maxFillDepthM = 0;
  for (const depth of conditioned.fillDepth) {
    if (depth <= epsilonM) continue;
    filledCellCount += 1;
    maxFillDepthM = Math.max(maxFillDepthM, depth);
  }
  return {
    elevations,
    routingElevations: conditioned.conditioned,
    receivers,
    accumulation,
    dominantOutlet,
    dominantOutletOnBoundary: isBoundary(dominantOutlet, width, height),
    watershed,
    conditioning: {
      filledCellCount,
      filledFraction: filledCellCount / elevations.length,
      maxFillDepthM,
      cellAreaM2: distances.northSouth * distances.eastWest,
    },
  };
}
