const SAMPLE_SIZE = 33;
const EARTH_RADIUS_M = 6371000;
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

export function buildFlowProducts(values, lat) {
  const elevations = Array.from(values, (value) => finiteElevation(Number(value)));
  if (elevations.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
    throw new Error(`Expected ${SAMPLE_SIZE * SAMPLE_SIZE} DEM samples, got ${elevations.length}`);
  }
  const receivers = computeD8Receivers(elevations, lat);
  const accumulation = computeFlowAccumulation(receivers);
  let dominantOutlet = 0;
  for (let index = 1; index < accumulation.length; index += 1) {
    if (accumulation[index] > accumulation[dominantOutlet]) dominantOutlet = index;
  }
  const watershed = delineateWatershed(receivers, dominantOutlet);
  return { elevations, receivers, accumulation, dominantOutlet, watershed };
}
