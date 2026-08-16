import { copernicusDemTileUrl } from './sahara-dem-relief.js';

const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';
const SAMPLE_SIZE = 33;
const EARTH_RADIUS_M = 6371000;

function finiteElevation(value) {
  if (!Number.isFinite(value) || Math.abs(value) > 12000) return 0;
  return Math.max(-500, Math.min(9000, value));
}

function centerOfBbox(bbox) {
  return {
    lon: (bbox[0] + bbox[2]) / 2,
    lat: (bbox[1] + bbox[3]) / 2,
  };
}

function cellDistances(lat) {
  const dLat = Math.PI / 180 / (SAMPLE_SIZE - 1);
  const dLon = dLat;
  const northSouth = EARTH_RADIUS_M * dLat;
  const eastWest = EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180) * dLon;
  return { northSouth, eastWest: Math.max(1, Math.abs(eastWest)) };
}

export function analyzeDemGrid(values, lat) {
  const elevations = Array.from(values, (value) => finiteElevation(Number(value)));
  if (elevations.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
    throw new Error(`Expected ${SAMPLE_SIZE * SAMPLE_SIZE} DEM samples, got ${elevations.length}`);
  }

  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const mean = elevations.reduce((sum, value) => sum + value, 0) / elevations.length;
  const distances = cellDistances(lat);

  let slopeSum = 0;
  let slopeCount = 0;
  let lowSlopeCells = 0;
  let sinkCells = 0;
  let valleyCells = 0;
  let interiorCells = 0;

  for (let row = 1; row < SAMPLE_SIZE - 1; row += 1) {
    for (let col = 1; col < SAMPLE_SIZE - 1; col += 1) {
      interiorCells += 1;
      const i = row * SAMPLE_SIZE + col;
      const z = elevations[i];
      const dzdx = (elevations[i + 1] - elevations[i - 1]) / (2 * distances.eastWest);
      const dzdy = (elevations[i + SAMPLE_SIZE] - elevations[i - SAMPLE_SIZE]) / (2 * distances.northSouth);
      const slopeDeg = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
      slopeSum += slopeDeg;
      slopeCount += 1;
      if (slopeDeg < 2) lowSlopeCells += 1;

      let lowerNeighbor = false;
      let neighborSum = 0;
      let neighborCount = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const neighbor = elevations[(row + dr) * SAMPLE_SIZE + col + dc];
          neighborSum += neighbor;
          neighborCount += 1;
          if (neighbor < z - 0.5) lowerNeighbor = true;
        }
      }
      if (!lowerNeighbor) sinkCells += 1;
      if (z < neighborSum / neighborCount - 2) valleyCells += 1;
    }
  }

  const meanSlopeDeg = slopeSum / Math.max(1, slopeCount);
  const sinkFraction = sinkCells / Math.max(1, interiorCells);
  const lowSlopeFraction = lowSlopeCells / Math.max(1, interiorCells);
  const valleyFraction = valleyCells / Math.max(1, interiorCells);

  // Screening index only: prioritises low-gradient terrain and local depressions.
  // It is not a storage-volume or flood-safety calculation.
  const retentionScreeningScore = Math.round(Math.max(0, Math.min(100,
    100 * (0.50 * lowSlopeFraction + 0.30 * sinkFraction + 0.20 * valleyFraction),
  )));

  return {
    minElevationM: min,
    maxElevationM: max,
    meanElevationM: mean,
    reliefM: max - min,
    meanSlopeDeg,
    sinkFraction,
    lowSlopeFraction,
    valleyFraction,
    retentionScreeningScore,
  };
}

async function loadDemAt(lat, lon) {
  const { fromUrl } = await import(GEOTIFF_MODULE_URL);
  const url = copernicusDemTileUrl(lat, lon);
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const values = await image.readRasters({
    width: SAMPLE_SIZE,
    height: SAMPLE_SIZE,
    interleave: true,
    resampleMethod: 'bilinear',
  });
  return { values, url };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function rowHtml(test, metrics) {
  return `<tr><td><strong>${test.name}</strong><br><small>${test.continent}</small></td>`
    + `<td>${Math.round(metrics.minElevationM)}–${Math.round(metrics.maxElevationM)} m</td>`
    + `<td>${Math.round(metrics.reliefM)} m</td>`
    + `<td>${metrics.meanSlopeDeg.toFixed(2)}°</td>`
    + `<td>${percent(metrics.lowSlopeFraction)}</td>`
    + `<td>${percent(metrics.sinkFraction)}</td>`
    + `<td><strong>${metrics.retentionScreeningScore}/100</strong></td></tr>`;
}

async function runEightTestHydrology() {
  const button = document.getElementById('runHydrology8');
  const status = document.getElementById('hydrologyStatus');
  const rows = document.getElementById('hydrologyRows');
  if (!button || !status || !rows) return;

  button.disabled = true;
  rows.innerHTML = '';
  status.textContent = 'Ładowanie manifestu 8 testów…';

  try {
    const manifestResponse = await fetch('./paleoriver-tests/manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const results = [];

    for (let index = 0; index < manifest.tests.length; index += 1) {
      const test = manifest.tests[index];
      const center = centerOfBbox(test.bbox);
      status.textContent = `Copernicus DEM: ${index + 1}/${manifest.tests.length} — ${test.name}`;
      try {
        const { values, url } = await loadDemAt(center.lat, center.lon);
        const metrics = analyzeDemGrid(values, center.lat);
        results.push({ id: test.id, name: test.name, center, demUrl: url, ...metrics });
        rows.insertAdjacentHTML('beforeend', rowHtml(test, metrics));
      } catch (error) {
        results.push({ id: test.id, name: test.name, center, error: error?.message || 'DEM unavailable' });
        rows.insertAdjacentHTML('beforeend', `<tr><td><strong>${test.name}</strong></td><td colspan="6">DEM chwilowo niedostępny: ${error?.message || 'błąd sieci'}</td></tr>`);
      }
    }

    window.__paleoriverHydrology8 = results;
    const completed = results.filter((item) => !item.error).length;
    status.textContent = `Gotowe: ${completed}/${manifest.tests.length} regionalnych próbek DEM. Wyniki są wskaźnikami przesiewowymi, nie projektem hydrologicznym.`;
  } catch (error) {
    status.textContent = `Analiza DEM nie została ukończona: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

document.getElementById('runHydrology8')?.addEventListener('click', runEightTestHydrology);
