const EARTH_RADIUS_KM = 6371;

export function tracePrincipalPath(receivers, accumulation, watershedMask, outletIndex) {
  let source = outletIndex;
  let bestSteps = -1;
  for (let candidate = 0; candidate < receivers.length; candidate += 1) {
    if (!watershedMask[candidate]) continue;
    let current = candidate;
    let steps = 0;
    const seen = new Set();
    while (current >= 0 && current !== outletIndex && !seen.has(current)) {
      seen.add(current);
      current = receivers[current];
      steps += 1;
      if (steps > receivers.length) break;
    }
    if (current === outletIndex && (steps > bestSteps || (steps === bestSteps && accumulation[candidate] < accumulation[source]))) {
      source = candidate;
      bestSteps = steps;
    }
  }

  const path = [];
  let current = source;
  const seen = new Set();
  while (current >= 0 && !seen.has(current)) {
    path.push(current);
    if (current === outletIndex) break;
    seen.add(current);
    current = receivers[current];
  }
  if (path.at(-1) !== outletIndex) path.push(outletIndex);
  return path;
}

function haversineKm(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthKm(path) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += haversineKm(path[index - 1], path[index]);
  return total;
}

export function compareDrainagePaths(singlePath, mosaicPath, toleranceKm = 25) {
  if (!singlePath.length || !mosaicPath.length) {
    return { meanNearestKm: Infinity, concordantFraction: 0, outletDistanceKm: Infinity };
  }
  let sum = 0;
  let concordant = 0;
  for (const point of singlePath) {
    let nearest = Infinity;
    for (const candidate of mosaicPath) nearest = Math.min(nearest, haversineKm(point, candidate));
    sum += nearest;
    if (nearest <= toleranceKm) concordant += 1;
  }
  return {
    meanNearestKm: sum / singlePath.length,
    concordantFraction: concordant / singlePath.length,
    outletDistanceKm: haversineKm(singlePath.at(-1), mosaicPath.at(-1)),
  };
}
