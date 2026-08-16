import { copernicusDemTileUrl } from './sahara-dem-relief.js';
import { SAMPLE_SIZE, buildFlowProducts } from './sahara-flow-core.js';
import { loadCopernicusDemMosaic } from './sahara-dem-mosaic.js';
import { buildMosaicFlowProducts } from './sahara-flow-grid.js';
import { compareDrainagePaths, pathLengthKm, tracePrincipalPath } from './sahara-flow-path.js';

const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';

function centerOfBbox(bbox) {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

function singlePoint(index, center) {
  const row = Math.floor(index / SAMPLE_SIZE);
  const col = index % SAMPLE_SIZE;
  const latFloor = Math.floor(center.lat);
  const lonFloor = Math.floor(center.lon);
  return {
    lat: latFloor + 1 - row / (SAMPLE_SIZE - 1),
    lon: lonFloor + col / (SAMPLE_SIZE - 1),
  };
}

function mosaicPoint(index, mosaic) {
  const row = Math.floor(index / mosaic.width);
  const col = index % mosaic.width;
  return {
    lat: mosaic.latNorth - row * mosaic.latSpanDeg / Math.max(1, mosaic.height - 1),
    lon: mosaic.lonWest + col * mosaic.lonSpanDeg / Math.max(1, mosaic.width - 1),
  };
}

async function loadSingleDem(center) {
  const { fromUrl } = await import(GEOTIFF_MODULE_URL);
  const url = copernicusDemTileUrl(center.lat, center.lon);
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const values = await image.readRasters({
    width: SAMPLE_SIZE,
    height: SAMPLE_SIZE,
    interleave: true,
    resampleMethod: 'bilinear',
  });
  return values;
}

function classifyPathConcordance(metrics) {
  if (metrics.concordantFraction >= 0.75 && metrics.outletDistanceKm <= 35) return 'wysoka';
  if (metrics.concordantFraction >= 0.45 && metrics.outletDistanceKm <= 80) return 'umiarkowana';
  return 'niska';
}

function csvText(results) {
  const fields = [
    'id', 'name', 'singlePathKm', 'mosaicPathKm', 'meanNearestKm',
    'concordantFraction', 'outletDistanceKm', 'pathConcordance',
  ];
  const rows = [fields.join(',')];
  for (const item of results) {
    rows.push(fields.map((field) => {
      const value = item[field] ?? '';
      return typeof value === 'string' ? `"${value.replaceAll('"', '""')}"` : value;
    }).join(','));
  }
  return `${rows.join('\n')}\n`;
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

function viewButton(result) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Pokaż 3D';
  button.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sahara:show-drainage-paths', { detail: result }));
    document.getElementById('planetViewer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  return button;
}

async function runPathConcordanceEight() {
  const button = document.getElementById('runPathConcordance8');
  const status = document.getElementById('pathConcordanceStatus');
  const rows = document.getElementById('pathConcordanceRows');
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
      status.textContent = `Ścieżki 1° vs 3°: ${index + 1}/${manifest.tests.length} — ${test.name}`;
      try {
        const [singleValues, mosaic] = await Promise.all([
          loadSingleDem(center),
          loadCopernicusDemMosaic(center.lat, center.lon),
        ]);
        const singleFlow = buildFlowProducts(singleValues, center.lat);
        const mosaicFlow = buildMosaicFlowProducts(mosaic, center.lat);
        const singleIndices = tracePrincipalPath(
          singleFlow.receivers,
          singleFlow.accumulation,
          singleFlow.watershed.mask,
          singleFlow.dominantOutlet,
        );
        const mosaicIndices = tracePrincipalPath(
          mosaicFlow.receivers,
          mosaicFlow.accumulation,
          mosaicFlow.watershed.mask,
          mosaicFlow.dominantOutlet,
        );
        const singlePath = singleIndices.map((cell) => singlePoint(cell, center));
        const mosaicPath = mosaicIndices.map((cell) => mosaicPoint(cell, mosaic));
        const comparison = compareDrainagePaths(singlePath, mosaicPath, 25);
        const result = {
          id: test.id,
          name: test.name,
          continent: test.continent,
          center,
          singlePath,
          mosaicPath,
          singlePathKm: pathLengthKm(singlePath),
          mosaicPathKm: pathLengthKm(mosaicPath),
          ...comparison,
          pathConcordance: classifyPathConcordance(comparison),
        };
        results.push(result);
        const row = document.createElement('tr');
        row.innerHTML = `<td><strong>${test.name}</strong><br><small>${test.continent}</small></td>`
          + `<td>${result.singlePathKm.toFixed(0)} km</td>`
          + `<td>${result.mosaicPathKm.toFixed(0)} km</td>`
          + `<td>${result.meanNearestKm.toFixed(1)} km</td>`
          + `<td>${(result.concordantFraction * 100).toFixed(0)}%</td>`
          + `<td>${result.outletDistanceKm.toFixed(1)} km</td>`
          + `<td><strong>${result.pathConcordance}</strong></td><td></td>`;
        row.lastElementChild.appendChild(viewButton(result));
        rows.appendChild(row);
      } catch (error) {
        rows.insertAdjacentHTML(
          'beforeend',
          `<tr><td><strong>${test.name}</strong></td><td colspan="7">Niedostępne: ${error?.message || 'błąd'}</td></tr>`,
        );
      }
    }
    window.__paleoriverPathConcordance8 = results;
    document.getElementById('downloadPathConcordanceJson').disabled = results.length === 0;
    document.getElementById('downloadPathConcordanceCsv').disabled = results.length === 0;
    const high = results.filter((item) => item.pathConcordance === 'wysoka').length;
    status.textContent = `Gotowe: ${results.length}/${manifest.tests.length}. Wysoka zgodność ścieżki: ${high}. To screening odporności modelu, nie dowód paleorzeki.`;
  } catch (error) {
    status.textContent = `Analiza ścieżek nie została ukończona: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

export function mountPathConcordanceScreening() {
  const suite = document.getElementById('paleoriver-test-suite');
  if (!suite || document.getElementById('path-concordance-8')) return false;
  const panel = document.createElement('div');
  panel.id = 'path-concordance-8';
  panel.className = 'panel';
  panel.style.marginTop = '1rem';
  panel.innerHTML = `
    <div class="eyebrow">ŚCIEŻKA ODPŁYWU / 1° VS 3° / 8 TESTÓW</div>
    <h3>Czy cały przebieg głównego drenażu pozostaje podobny po poszerzeniu modelu?</h3>
    <p>Moduł śledzi najdłuższą ścieżkę D8 należącą do dominującej zlewni od źródłowej komórki do dominującego odpływu. Porównuje przebieg 1°×1° z mozaiką 3°×3°, zamiast oceniać wyłącznie azymut końcowego odpływu.</p>
    <div class="button-grid compact">
      <button id="runPathConcordance8" class="action" type="button">Porównaj całe ścieżki 8 testów</button>
      <button id="downloadPathConcordanceJson" type="button" disabled>Pobierz ścieżki JSON</button>
      <button id="downloadPathConcordanceCsv" type="button" disabled>Pobierz cechy CSV</button>
    </div>
    <p id="pathConcordanceStatus" class="action-message" role="status" aria-live="polite">Analiza ścieżek czeka na uruchomienie.</p>
    <div class="tablewrap"><table><thead><tr><th>Test</th><th>Ścieżka 1°</th><th>Ścieżka 3°</th><th>Śr. odległość</th><th>Zgodność ≤25 km</th><th>Δ odpływu</th><th>Ocena</th><th>3D</th></tr></thead><tbody id="pathConcordanceRows"></tbody></table></div>
    <p class="method-note"><strong>Interpretacja:</strong> wskaźnik porównuje geometrię dwóch wyników modelowych. Wysoka zgodność oznacza, że co najmniej 75% punktów ścieżki 1° leży do 25 km od ścieżki 3°, a punkty odpływu dzieli najwyżej 35 km. Nie jest to kryterium geologiczne ani potwierdzenie dawnej rzeki.</p>`;
  suite.appendChild(panel);
  document.getElementById('runPathConcordance8').addEventListener('click', runPathConcordanceEight);
  document.getElementById('downloadPathConcordanceJson').addEventListener('click', () => {
    const data = window.__paleoriverPathConcordance8 || [];
    downloadText('paleoriver_path_concordance_8.json', 'application/json', `${JSON.stringify(data, null, 2)}\n`);
  });
  document.getElementById('downloadPathConcordanceCsv').addEventListener('click', () => {
    downloadText('paleoriver_path_concordance_8.csv', 'text/csv;charset=utf-8', csvText(window.__paleoriverPathConcordance8 || []));
  });
  return true;
}

mountPathConcordanceScreening();
