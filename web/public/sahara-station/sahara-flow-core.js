const SAMPLE_SIZE = 33;
const EARTH_RADIUS_M = 6371000;
const FLAT_EPSILON_M = 0.001;
const D8_NEIGHBORS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export { SAMPLE_SIZE };

export function finiteElevation(value) {
  if (!Number.isFinite(value) || Math.abs(value) > 12000) return 0;
  return Math.max(-500, Math.min(9000, value));
}

export function cellDistances(lat) {
  const dLat = Math.PI / 180 / (SAMPLE_SIZE - 1);
  const northSouth = EARTH_RADIUS_M * dLat;
  const eastWest = EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180) * dLat;
  return { northSouth, eastWest: Math.max(1, Math.abs(eastWest)) };
}

function neighborDistance(dr, dc, distances) {
  return Math.hypot(dr * distances.northSouth, dc * distances.eastWest);
}

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

function boundaryIndices() {
  const indices = [];
  for (let col = 0; col < SAMPLE_SIZE; col += 1) {
    indices.push(col);
    indices.push((SAMPLE_SIZE - 1) * SAMPLE_SIZE + col);
  }
  for (let row = 1; row < SAMPLE_SIZE - 1; row += 1) {
    indices.push(row * SAMPLE_SIZE);
    indices.push(row * SAMPLE_SIZE + SAMPLE_SIZE - 1);
  }
  return indices;
}

export function conditionDemForDrainage(elevations, epsilonM = FLAT_EPSILON_M) {
  const conditioned = Float64Array.from(elevations);
  const fillDepth = new Float64Array(elevations.length);
  const visited = new Uint8Array(elevations.length);
  const heap = [];

  for (const index of boundaryIndices()) {
    if (visited[index]) continue;
    visited[index] = 1;
    pushHeap(heap, [conditioned[index], index]);
  }

  while (heap.length > 0) {
    const item = popHeap(heap);
    if (!item) break;
    const [spillElevation, index] = item;
    const row = Math.floor(index / SAMPLE_SIZE);
    const col = index % SAMPLE_SIZE;

    for (const [dr, dc] of D8_NEIGHBORS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SAMPLE_SIZE || nc < 0 || nc >= SAMPLE_SIZE) continue;
      const neighbor = nr * SAMPLE_SIZE + nc;
      if (visited[neighbor]) continue;
      visited[neighbor] = 1;

      const original = conditioned[neighbor];
      const minimumDrainable = spillElevation + epsilonM;
      if (original <= spillElevation) {
        conditioned[neighbor] = minimumDrainable;
        fillDepth[neighbor] = Math.max(0, minimumDrainable - elevations[neighbor]);
      }
      pushHeap(heap, [conditioned[neighbor], neighbor]);
    }
  }

  let filledCellCount = 0;
  let fillDepthSumM = 0;
  let maxFillDepthM = 0;
  for (const depth of fillDepth) {
    if (depth <= epsilonM) continue;
    filledCellCount += 1;
    fillDepthSumM += depth;
    maxFillDepthM = Math.max(maxFillDepthM, depth);
  }

  return {
    conditionedElevations: conditioned,
    fillDepth,
    filledCellCount,
    filledFraction: filledCellCount / elevations.length,
    meanFillDepthM: filledCellCount > 0 ? fillDepthSumM / filledCellCount : 0,
    maxFillDepthM,
  };
}

export function computeD8Receivers(elevations, lat) {
  const distances = cellDistances(lat);
  const receivers = new Int32Array(elevations.length);
  receivers.fill(-1);

  for (let row = 0; row < SAMPLE_SIZE; row += 1) {
    for (let col = 0; col < SAMPLE_SIZE; col += 1) {
      const index = row * SAMPLE_SIZE + col;
      const z = elevations[index];
      let bestReceiver = -1;
      let bestGradient = 0;

      for (const [dr, dc] of D8_NEIGHBORS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= SAMPLE_SIZE || nc < 0 || nc >= SAMPLE_SIZE) continue;
        const neighborIndex = nr * SAMPLE_SIZE + nc;
        const drop = z - elevations[neighborIndex];
        if (drop <= 0) continue;
        const gradient = drop / neighborDistance(dr, dc, distances);
        if (gradient > bestGradient) {
          bestGradient = gradient;
          bestReceiver = neighborIndex;
        }
      }
      receivers[index] = bestReceiver;
    }
  }
  return receivers;
}

export function computeFlowAccumulation(receivers) {
  const count = receivers.length;
  const indegree = new Int32Array(count);
  const accumulation = new Float64Array(count);
  accumulation.fill(1);

  for (let index = 0; index < count; index += 1) {
    const receiver = receivers[index];
    if (receiver >= 0) indegree[receiver] += 1;
  }

  const queue = [];
  for (let index = 0; index < count; index += 1) {
    if (indegree[index] === 0) queue.push(index);
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const receiver = receivers[index];
    if (receiver < 0) continue;
    accumulation[receiver] += accumulation[index];
    indegree[receiver] -= 1;
    if (indegree[receiver] === 0) queue.push(receiver);
  }
  return accumulation;
}

export function delineateWatershed(receivers, outletIndex) {
  const donors = Array.from({ length: receivers.length }, () => []);
  for (let index = 0; index < receivers.length; index += 1) {
    const receiver = receivers[index];
    if (receiver >= 0) donors[receiver].push(index);
  }

  const visited = new Uint8Array(receivers.length);
  const stack = [outletIndex];
  visited[outletIndex] = 1;
  let size = 0;
  while (stack.length > 0) {
    const index = stack.pop();
    size += 1;
    for (const donor of donors[index]) {
      if (visited[donor]) continue;
      visited[donor] = 1;
      stack.push(donor);
    }
  }
  return { mask: visited, size };
}

export function percentile(values, fraction) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(fraction * (sorted.length - 1))),
  );
  return sorted[index];
}

function interiorSinkCount(receivers) {
  let count = 0;
  for (let row = 1; row < SAMPLE_SIZE - 1; row += 1) {
    for (let col = 1; col < SAMPLE_SIZE - 1; col += 1) {
      if (receivers[row * SAMPLE_SIZE + col] < 0) count += 1;
    }
  }
  return count;
}

export function buildFlowProducts(values, lat, options = {}) {
  const elevations = Array.from(values, (value) => finiteElevation(Number(value)));
  if (elevations.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
    throw new Error(`Expected ${SAMPLE_SIZE * SAMPLE_SIZE} DEM samples, got ${elevations.length}`);
  }

  const useConditioning = options.condition !== false;
  const conditioning = useConditioning
    ? conditionDemForDrainage(elevations, options.epsilonM ?? FLAT_EPSILON_M)
    : {
        conditionedElevations: Float64Array.from(elevations),
        fillDepth: new Float64Array(elevations.length),
        filledCellCount: 0,
        filledFraction: 0,
        meanFillDepthM: 0,
        maxFillDepthM: 0,
      };
  const routingElevations = conditioning.conditionedElevations;
  const receivers = computeD8Receivers(routingElevations, lat);
  const accumulation = computeFlowAccumulation(receivers);
  let dominantOutlet = 0;
  for (let index = 1; index < accumulation.length; index += 1) {
    if (accumulation[index] > accumulation[dominantOutlet]) dominantOutlet = index;
  }
  const watershed = delineateWatershed(receivers, dominantOutlet);
  const distances = cellDistances(lat);
  const cellAreaM2 = distances.northSouth * distances.eastWest;
  let fillVolumeNumericalM3 = 0;
  for (const depth of conditioning.fillDepth) fillVolumeNumericalM3 += depth * cellAreaM2;

  return {
    elevations,
    routingElevations,
    receivers,
    accumulation,
    dominantOutlet,
    watershed,
    conditioning: {
      ...conditioning,
      cellAreaM2,
      fillVolumeNumericalM3,
      interiorSinkCountAfter: interiorSinkCount(receivers),
    },
  };
}
