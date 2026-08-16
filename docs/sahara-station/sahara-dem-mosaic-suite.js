import './sahara-drainage-stability.js';
import { loadCopernicusDemMosaic } from './sahara-dem-mosaic.js';
import { buildMosaicFlowProducts } from './sahara-flow-grid.js';

function centerOfBbox(bbox) {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
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

function rowHtml(test, result) {
  return `<tr><td><strong>${test.name}</strong><br><small>${test.continent}</small></td>`
    + `<td>${result.tileCount}</td>`
    + `<td>${result.gridWidth}×${result.gridHeight}</td>`
    + `<td>${Math.round(result.maxAccumulationCells)} kom.</td>`
    + `<td>${percent(result.dominantWatershedFraction)}</td>`
    + `<td>${result.dominantOutletOnBoundary ? 'tak' : 'nie'}</td>`
    + `<td>${percent(result.conditionedFilledFraction)}</td></tr>`;
}

function resultsCsv(results) {
  const fields = [
    'id', 'name', 'lat', 'lon', 'tileCount', 'gridWidth', 'gridHeight',
    'maxAccumulationCells', 'dominantWatershedFraction', 'dominantOutletOnBoundary',
    'conditionedFilledFraction', 'conditionedMaxFillDepthM',
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

async function runMosaicEight() {
  const button = document.getElementById('runHydrologyMosaic8');
  const status = document.getElementById('hydrologyMosaicStatus');
  const rows = document.getElementById('hydrologyMosaicRows');
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
      status.textContent = `Mozaika Copernicus DEM 3×3: ${index + 1}/${manifest.tests.length} — ${test.name}`;
      try {
        const mosaic = await loadCopernicusDemMosaic(center.lat, center.lon);
        const flow = buildMosaicFlowProducts(mosaic, center.lat);
        const result = {
          id: test.id,
          name: test.name,
          center,
          tileCount: mosaic.tileCount,
          gridWidth: mosaic.width,
          gridHeight: mosaic.height,
          maxAccumulationCells: flow.accumulation[flow.dominantOutlet],
          dominantWatershedFraction: flow.watershed.size / flow.accumulation.length,
          dominantOutletOnBoundary: flow.dominantOutletOnBoundary,
          conditionedFilledFraction: flow.conditioning.filledFraction,
          conditionedMaxFillDepthM: flow.conditioning.maxFillDepthM,
        };
        results.push(result);
        rows.insertAdjacentHTML('beforeend', rowHtml(test, result));
      } catch (error) {
        rows.insertAdjacentHTML('beforeend', `<tr><td><strong>${test.name}</strong></td><td colspan="6">Mozaika niedostępna: ${error?.message || 'błąd'}</td></tr>`);
      }
    }
    window.__paleoriverMosaicHydrology8 = results;
    document.getElementById('downloadHydrologyMosaicJson').disabled = results.length === 0;
    document.getElementById('downloadHydrologyMosaicCsv').disabled = results.length === 0;
    status.textContent = `Gotowe: ${results.length}/${manifest.tests.length} przypadków z mozaiką 3×3. Wynik służy do sprawdzania wrażliwości D8 na granice pojedynczego kafla.`;
  } catch (error) {
    status.textContent = `Analiza mozaiki nie została ukończona: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

export function mountMosaicHydrologyScreening() {
  const suite = document.getElementById('paleoriver-test-suite');
  if (!suite || document.getElementById('hydrology-mosaic-8')) return false;
  const panel = document.createElement('div');
  panel.id = 'hydrology-mosaic-8';
  panel.className = 'panel';
  panel.style.marginTop = '1rem';
  panel.innerHTML = `
    <div class="eyebrow">DEM 3×3 / D8 / TEST GRANICY KAFLA</div>
    <h3>Mozaika 9 kafli Copernicus DEM dla 8 przypadków</h3>
    <p>Każdy przypadek używa 9 sąsiednich kafli DEM. Próbki 17×17 są składane bez dublowania wspólnych krawędzi do siatki 49×49 obejmującej około 3°×3°. To pozwala sprawdzić, czy dominująca zlewnia i odpływ nie były artefaktem granicy pojedynczego kafla 1°×1°.</p>
    <div class="button-grid compact">
      <button id="runHydrologyMosaic8" class="action" type="button">Uruchom mozaikę 3×3 dla 8 testów</button>
      <button id="downloadHydrologyMosaicJson" type="button" disabled>Pobierz JSON 3×3</button>
      <button id="downloadHydrologyMosaicCsv" type="button" disabled>Pobierz CSV 3×3</button>
    </div>
    <p id="hydrologyMosaicStatus" class="action-message" role="status" aria-live="polite">Analiza mozaiki czeka na uruchomienie.</p>
    <div class="tablewrap"><table><thead><tr><th>Test</th><th>Kafle</th><th>Siatka</th><th>Max akumulacja</th><th>Dominująca zlewnia</th><th>Odpływ na brzegu</th><th>Kondycjonowanie</th></tr></thead><tbody id="hydrologyMosaicRows"></tbody></table></div>
    <p class="method-note"><strong>Interpretacja:</strong> stabilność wyniku po rozszerzeniu z 1°×1° do 3°×3° zwiększa zaufanie do kierunku drenażu, ale nadal nie dowodzi paleorzeki i nie wyznacza pojemności retencyjnej. Potrzebne są obrazy optyczne/SAR, geologia, osady i większy kontekst zlewni.</p>`;
  suite.appendChild(panel);
  document.getElementById('runHydrologyMosaic8').addEventListener('click', runMosaicEight);
  document.getElementById('downloadHydrologyMosaicJson').addEventListener('click', () => {
    const results = window.__paleoriverMosaicHydrology8 || [];
    downloadText('paleoriver_hydrology_mosaic_8.json', 'application/json', `${JSON.stringify(results, null, 2)}\n`);
  });
  document.getElementById('downloadHydrologyMosaicCsv').addEventListener('click', () => {
    downloadText('paleoriver_hydrology_mosaic_8.csv', 'text/csv;charset=utf-8', resultsCsv(window.__paleoriverMosaicHydrology8 || []));
  });
  return true;
}

mountMosaicHydrologyScreening();
