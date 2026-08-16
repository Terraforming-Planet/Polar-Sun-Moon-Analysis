import { copernicusDemTileUrl } from './sahara-dem-relief.js';
import { SAMPLE_SIZE, buildFlowProducts } from './sahara-flow-core.js';
import { loadCopernicusDemMosaic } from './sahara-dem-mosaic.js';
import { buildMosaicFlowProducts } from './sahara-flow-grid.js';

const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';

function centerOfBbox(bbox) {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

function outletFromSingle(index, lat, lon) {
  const row = Math.floor(index / SAMPLE_SIZE);
  const col = index % SAMPLE_SIZE;
  const latFloor = Math.floor(lat);
  const lonFloor = Math.floor(lon);
  return {
    lat: latFloor + 1 - row / (SAMPLE_SIZE - 1),
    lon: lonFloor + col / (SAMPLE_SIZE - 1),
  };
}

function outletFromMosaic(index, mosaic) {
  const row = Math.floor(index / mosaic.width);
  const col = index % mosaic.width;
  return {
    lat: mosaic.latNorth - row * mosaic.latSpanDeg / Math.max(1, mosaic.height - 1),
    lon: mosaic.lonWest + col * mosaic.lonSpanDeg / Math.max(1, mosaic.width - 1),
  };
}

function bearingDeg(from, to) {
  const phi1 = from.lat * Math.PI / 180;
  const phi2 = to.lat * Math.PI / 180;
  const dLon = (to.lon - from.lon) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function angularDifferenceDeg(a, b) {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

export function classifyDrainageStability(angleDeltaDeg, watershedDelta) {
  if (angleDeltaDeg <= 45 && watershedDelta <= 0.15) return 'stabilny';
  if (angleDeltaDeg <= 90 && watershedDelta <= 0.30) return 'umiarkowany';
  return 'wrażliwy';
}

async function loadSingleDem(lat, lon) {
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

function rowHtml(test, result) {
  return `<tr><td><strong>${test.name}</strong><br><small>${test.continent}</small></td>`
    + `<td>${result.singleBearingDeg.toFixed(0)}°</td>`
    + `<td>${result.mosaicBearingDeg.toFixed(0)}°</td>`
    + `<td>${result.angleDeltaDeg.toFixed(0)}°</td>`
    + `<td>${percent(result.singleWatershedFraction)} → ${percent(result.mosaicWatershedFraction)}</td>`
    + `<td>${percent(result.watershedDelta)}</td>`
    + `<td><strong>${result.stability}</strong></td></tr>`;
}

function resultsCsv(results) {
  const fields = [
    'id', 'name', 'lat', 'lon', 'singleBearingDeg', 'mosaicBearingDeg', 'angleDeltaDeg',
    'singleWatershedFraction', 'mosaicWatershedFraction', 'watershedDelta',
    'singleMaxAccumulationCells', 'mosaicMaxAccumulationCells', 'stability',
  ];
  const lines = [fields.join(',')];
  for (const item of results) {
    lines.push(fields.map((field) => {
      if (field === 'lat') return item.center.lat;
      if (field === 'lon') return item.center.lon;
      const value = item[field] ?? '';
      return typeof value === 'string' ? `"${value.replaceAll('"', '""')}"` : value;
    }).join(','));
  }
  return `${lines.join('\n')}\n`;
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

async function runDrainageStabilityEight() {
  const button = document.getElementById('runDrainageStability8');
  const status = document.getElementById('drainageStabilityStatus');
  const rows = document.getElementById('drainageStabilityRows');
  if (!button || !status || !rows) return;
  button.disabled = true;
  rows.innerHTML = '';
  try {
    const response = await fetch('./paleoriver-tests/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    const manifest = await response.json();
    const results = [];
    for (let index = 0; index < manifest.tests.length; index += 1) {
      const test = manifest.tests[index];
      const center = centerOfBbox(test.bbox);
      status.textContent = `Porównanie 1° vs 3°: ${index + 1}/${manifest.tests.length} — ${test.name}`;
      try {
        const [single, mosaic] = await Promise.all([
          loadSingleDem(center.lat, center.lon),
          loadCopernicusDemMosaic(center.lat, center.lon),
        ]);
        const singleFlow = buildFlowProducts(single.values, center.lat);
        const mosaicFlow = buildMosaicFlowProducts(mosaic, center.lat);
        const singleOutlet = outletFromSingle(singleFlow.dominantOutlet, center.lat, center.lon);
        const mosaicOutlet = outletFromMosaic(mosaicFlow.dominantOutlet, mosaic);
        const singleBearingDeg = bearingDeg(center, singleOutlet);
        const mosaicBearingDeg = bearingDeg(center, mosaicOutlet);
        const angleDeltaDeg = angularDifferenceDeg(singleBearingDeg, mosaicBearingDeg);
        const singleWatershedFraction = singleFlow.watershed.size / singleFlow.accumulation.length;
        const mosaicWatershedFraction = mosaicFlow.watershed.size / mosaicFlow.accumulation.length;
        const watershedDelta = Math.abs(singleWatershedFraction - mosaicWatershedFraction);
        const result = {
          id: test.id,
          name: test.name,
          center,
          singleBearingDeg,
          mosaicBearingDeg,
          angleDeltaDeg,
          singleWatershedFraction,
          mosaicWatershedFraction,
          watershedDelta,
          singleMaxAccumulationCells: singleFlow.accumulation[singleFlow.dominantOutlet],
          mosaicMaxAccumulationCells: mosaicFlow.accumulation[mosaicFlow.dominantOutlet],
          stability: classifyDrainageStability(angleDeltaDeg, watershedDelta),
        };
        results.push(result);
        rows.insertAdjacentHTML('beforeend', rowHtml(test, result));
      } catch (error) {
        rows.insertAdjacentHTML('beforeend', `<tr><td><strong>${test.name}</strong></td><td colspan="6">Porównanie niedostępne: ${error?.message || 'błąd'}</td></tr>`);
      }
    }
    window.__paleoriverDrainageStability8 = results;
    document.getElementById('downloadDrainageStabilityJson').disabled = results.length === 0;
    document.getElementById('downloadDrainageStabilityCsv').disabled = results.length === 0;
    const stable = results.filter((item) => item.stability === 'stabilny').length;
    const sensitive = results.filter((item) => item.stability === 'wrażliwy').length;
    status.textContent = `Gotowe: ${results.length}/${manifest.tests.length}. Stabilne: ${stable}, wrażliwe na skalę: ${sensitive}. Klasyfikacja jest testem odporności modelu, nie dowodem paleorzeki.`;
  } catch (error) {
    status.textContent = `Porównanie stabilności nie zostało ukończone: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

export function mountDrainageStabilityScreening() {
  const suite = document.getElementById('paleoriver-test-suite');
  if (!suite || document.getElementById('drainage-stability-8')) return false;
  const panel = document.createElement('div');
  panel.id = 'drainage-stability-8';
  panel.className = 'panel';
  panel.style.marginTop = '1rem';
  panel.innerHTML = `
    <div class="eyebrow">ODPORNOŚĆ MODELU / 1° VS 3° / 8 TESTÓW</div>
    <h3>Czy kierunek dominującego drenażu pozostaje podobny po poszerzeniu obszaru?</h3>
    <p>Moduł liczy ten sam Priority-Flood + D8 dla pojedynczego kafla 1°×1° i mozaiki 3°×3°. Porównuje azymut dominującego odpływu oraz zmianę udziału dominującej zlewni. Ma to wykrywać przypadki, w których wynik jest wrażliwy na sztuczną granicę analizowanego obszaru.</p>
    <div class="button-grid compact">
      <button id="runDrainageStability8" class="action" type="button">Porównaj 1° i 3° dla 8 testów</button>
      <button id="downloadDrainageStabilityJson" type="button" disabled>Pobierz stabilność JSON</button>
      <button id="downloadDrainageStabilityCsv" type="button" disabled>Pobierz stabilność CSV</button>
    </div>
    <p id="drainageStabilityStatus" class="action-message" role="status" aria-live="polite">Porównanie stabilności czeka na uruchomienie.</p>
    <div class="tablewrap"><table><thead><tr><th>Test</th><th>Kierunek 1°</th><th>Kierunek 3°</th><th>Δ kierunku</th><th>Zlewnia 1° → 3°</th><th>Δ zlewni</th><th>Ocena</th></tr></thead><tbody id="drainageStabilityRows"></tbody></table></div>
    <p class="method-note"><strong>Interpretacja:</strong> „stabilny” oznacza zgodność kierunku do 45° i zmianę udziału zlewni do 15 punktów procentowych. „Umiarkowany” dopuszcza 90° i 30 p.p. Pozostałe przypadki są oznaczane jako wrażliwe na skalę. Progi są roboczym screeningiem jakości modelu, a nie kryterium geologicznym.</p>`;
  suite.appendChild(panel);
  document.getElementById('runDrainageStability8').addEventListener('click', runDrainageStabilityEight);
  document.getElementById('downloadDrainageStabilityJson').addEventListener('click', () => {
    downloadText('paleoriver_drainage_stability_8.json', 'application/json', `${JSON.stringify(window.__paleoriverDrainageStability8 || [], null, 2)}\n`);
  });
  document.getElementById('downloadDrainageStabilityCsv').addEventListener('click', () => {
    downloadText('paleoriver_drainage_stability_8.csv', 'text/csv;charset=utf-8', resultsCsv(window.__paleoriverDrainageStability8 || []));
  });
  return true;
}

mountDrainageStabilityScreening();
