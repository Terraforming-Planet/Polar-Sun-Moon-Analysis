import { copernicusDemTileUrl } from './sahara-dem-relief.js';
import {
  SAMPLE_SIZE,
  buildFlowProducts,
  cellDistances,
  computeD8Receivers,
  computeFlowAccumulation,
  delineateWatershed,
  finiteElevation,
  percentile,
} from './sahara-flow-core.js';

export { computeD8Receivers, computeFlowAccumulation, delineateWatershed };

const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';

function centerOfBbox(bbox) {
  return {
    lon: (bbox[0] + bbox[2]) / 2,
    lat: (bbox[1] + bbox[3]) / 2,
  };
}

function flowScreening(values, lat) {
  const products = buildFlowProducts(values, lat);
  const p95 = percentile(products.accumulation, 0.95);
  let concentratedCells = 0;
  for (const value of products.accumulation) {
    if (value >= p95 && value > 1) concentratedCells += 1;
  }
  return {
    flowAccumulationMaxCells: products.accumulation[products.dominantOutlet],
    flowAccumulationP95Cells: p95,
    dominantWatershedFraction: products.watershed.size / products.accumulation.length,
    drainageConcentrationFraction: concentratedCells / products.accumulation.length,
    dominantOutletIndex: products.dominantOutlet,
  };
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
  const retentionScreeningScore = Math.round(Math.max(0, Math.min(100,
    100 * (0.50 * lowSlopeFraction + 0.30 * sinkFraction + 0.20 * valleyFraction),
  )));
  const flow = flowScreening(elevations, lat);

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
    ...flow,
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
    + `<td>${Math.round(metrics.flowAccumulationMaxCells)} kom.</td>`
    + `<td>${percent(metrics.dominantWatershedFraction)}</td>`
    + `<td>${percent(metrics.drainageConcentrationFraction)}</td>`
    + `<td><strong>${metrics.retentionScreeningScore}/100</strong></td></tr>`;
}

function downloadText(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function completedResults() {
  return (window.__paleoriverHydrology8 || []).filter((item) => !item.error);
}

function resultsCsv(results) {
  const fields = [
    'id', 'name', 'lat', 'lon', 'minElevationM', 'maxElevationM', 'meanElevationM',
    'reliefM', 'meanSlopeDeg', 'sinkFraction', 'lowSlopeFraction', 'valleyFraction',
    'retentionScreeningScore', 'flowAccumulationMaxCells', 'flowAccumulationP95Cells',
    'dominantWatershedFraction', 'drainageConcentrationFraction', 'dominantOutletIndex',
  ];
  const lines = [fields.join(',')];
  for (const item of results) {
    const row = fields.map((field) => {
      if (field === 'lat') return item.center.lat;
      if (field === 'lon') return item.center.lon;
      const value = item[field] ?? '';
      return typeof value === 'string' ? `"${value.replaceAll('"', '""')}"` : value;
    });
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

function updateDownloadButtons(enabled) {
  for (const id of ['downloadHydrologyJson', 'downloadHydrologyCsv']) {
    const button = document.getElementById(id);
    if (button) button.disabled = !enabled;
  }
}

function bindDownloads() {
  const jsonButton = document.getElementById('downloadHydrologyJson');
  const csvButton = document.getElementById('downloadHydrologyCsv');
  if (jsonButton && !jsonButton.dataset.bound) {
    jsonButton.dataset.bound = '1';
    jsonButton.addEventListener('click', () => {
      const results = completedResults();
      downloadText('paleoriver_hydrology_8.json', 'application/json', `${JSON.stringify(results, null, 2)}\n`);
    });
  }
  if (csvButton && !csvButton.dataset.bound) {
    csvButton.dataset.bound = '1';
    csvButton.addEventListener('click', () => {
      downloadText('paleoriver_hydrology_8.csv', 'text/csv;charset=utf-8', resultsCsv(completedResults()));
    });
  }
}

async function runEightTestHydrology() {
  const button = document.getElementById('runHydrology8');
  const status = document.getElementById('hydrologyStatus');
  const rows = document.getElementById('hydrologyRows');
  if (!button || !status || !rows) return;

  button.disabled = true;
  updateDownloadButtons(false);
  rows.innerHTML = '';
  status.textContent = 'Ładowanie manifestu 8 testów…';
  try {
    const response = await fetch('./paleoriver-tests/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    const manifest = await response.json();
    const results = [];
    for (let index = 0; index < manifest.tests.length; index += 1) {
      const test = manifest.tests[index];
      const center = centerOfBbox(test.bbox);
      status.textContent = `Copernicus DEM + D8: ${index + 1}/${manifest.tests.length} — ${test.name}`;
      try {
        const { values, url } = await loadDemAt(center.lat, center.lon);
        const metrics = analyzeDemGrid(values, center.lat);
        results.push({ id: test.id, name: test.name, center, demUrl: url, ...metrics });
        rows.insertAdjacentHTML('beforeend', rowHtml(test, metrics));
      } catch (error) {
        results.push({ id: test.id, name: test.name, center, error: error?.message || 'DEM unavailable' });
        rows.insertAdjacentHTML(
          'beforeend',
          `<tr><td><strong>${test.name}</strong></td><td colspan="7">DEM chwilowo niedostępny: ${error?.message || 'błąd sieci'}</td></tr>`,
        );
      }
    }
    window.__paleoriverHydrology8 = results;
    const completed = results.filter((item) => !item.error).length;
    updateDownloadButtons(completed > 0);
    status.textContent = `Gotowe: ${completed}/${manifest.tests.length} próbek DEM z D8. Wyniki można zapisać jako JSON/CSV. To screening, nie projekt hydrologiczny.`;
  } catch (error) {
    status.textContent = `Analiza DEM nie została ukończona: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

export function mountHydrologyScreening() {
  const suite = document.getElementById('paleoriver-test-suite');
  if (!suite) return false;
  let panel = document.getElementById('hydrology-screening-8');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'hydrology-screening-8';
    panel.className = 'panel';
    panel.style.marginTop = '1rem';
    panel.innerHTML = `
      <div class="eyebrow">DEM / D8 / ZLEWNIE — 8 TESTÓW</div>
      <h3>Przesiew retencji i kierunku spływu na Copernicus DEM GLO-90</h3>
      <p>Regionalna próbka 33×33 wokół środka każdego testu liczy relief, spadek, lokalne obniżenia oraz D8 flow direction, flow accumulation i dominującą zlewnię. Wyniki są wskaźnikami przesiewowymi, a nie pojemnością zbiornika ani dowodem dawnej rzeki.</p>
      <div class="button-grid compact">
        <button id="runHydrology8" class="action" type="button">Uruchom DEM + D8 dla 8 testów</button>
        <button id="downloadHydrologyJson" type="button" disabled>Pobierz wyniki JSON</button>
        <button id="downloadHydrologyCsv" type="button" disabled>Pobierz cechy CSV</button>
      </div>
      <p id="hydrologyStatus" class="action-message" role="status" aria-live="polite">Analiza DEM i D8 czeka na uruchomienie.</p>
      <div class="tablewrap"><table><thead><tr><th>Test</th><th>Wysokość</th><th>Relief</th><th>Śr. spadek</th><th>Max akumulacja</th><th>Dominująca zlewnia</th><th>Koncentracja odpływu</th><th>Retencja</th></tr></thead><tbody id="hydrologyRows"></tbody></table></div>
      <p class="method-note"><strong>Interpretacja:</strong> D8 wyznacza lokalnie najbardziej stromy odpływ do jednego z 8 sąsiadów. Płaskie powierzchnie i zamknięte obniżenia pozostają bez odbiorcy, więc wynik jest screeningiem. Na globie regionalny relief pokazuje teraz także najbardziej skoncentrowane linie D8 i dominujący punkt odpływu. Copernicus DEM jest DSM; przed decyzjami terenowymi potrzebne są hydrologiczne kondycjonowanie DEM, większy zasięg zlewni, geologia, infiltracja, parowanie, sedymentacja i dane terenowe.</p>`;
    suite.appendChild(panel);
  }
  const button = document.getElementById('runHydrology8');
  if (button && !button.dataset.hydrologyBound) {
    button.dataset.hydrologyBound = '1';
    button.addEventListener('click', runEightTestHydrology);
  }
  bindDownloads();
  return true;
}

mountHydrologyScreening();
