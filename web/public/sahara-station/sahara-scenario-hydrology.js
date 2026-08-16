import { copernicusDemTileUrl } from './sahara-dem-relief.js';
import { SAMPLE_SIZE } from './sahara-flow-core.js';
import { buildScenarioComparisonRecord } from './sahara-scenario-core.js';

const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';
const sourceCache = new Map();
let latestRecord = null;
let stale = true;

function fmt(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pl-PL', { maximumFractionDigits: digits });
}

function percent(value, digits = 1) {
  return `${fmt(Number(value) * 100, digits)}%`;
}

async function loadSourceDem(site) {
  const tileUrl = copernicusDemTileUrl(site.lat, site.lon);
  if (sourceCache.has(tileUrl)) return sourceCache.get(tileUrl);
  const promise = (async () => {
    const { fromUrl } = await import(GEOTIFF_MODULE_URL);
    const tiff = await fromUrl(tileUrl);
    const image = await tiff.getImage();
    const values = await image.readRasters({
      width: SAMPLE_SIZE,
      height: SAMPLE_SIZE,
      interleave: true,
      resampleMethod: 'bilinear',
    });
    return {
      values: Float64Array.from(values, Number),
      tileUrl,
      latFloor: Math.floor(site.lat),
      lonFloor: Math.floor(site.lon),
    };
  })();
  sourceCache.set(tileUrl, promise);
  try {
    return await promise;
  } catch (error) {
    sourceCache.delete(tileUrl);
    throw error;
  }
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

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function flatSummary(record) {
  const before = record.hydrology.before;
  const after = record.hydrology.after;
  const delta = record.hydrology.delta;
  return {
    site_lat: record.site.lat,
    site_lon: record.site.lon,
    edit_count: record.edits.length,
    source_dem_mutated: record.sourceDemMutated,
    design_cut_km3: record.rasterization.designCutKm3,
    design_fill_km3: record.rasterization.designFillKm3,
    design_bank_km3: record.rasterization.designBankKm3,
    rasterized_cut_km3: record.rasterization.rasterizedCutKm3,
    rasterized_fill_km3: record.rasterization.rasterizedFillKm3,
    changed_dem_fraction: record.rasterization.changedCellFraction,
    max_abs_delta_m: record.rasterization.maxAbsDeltaM,
    receiver_changed_fraction: delta.receiverChangedFraction,
    outlet_distance_km: delta.outletDistanceKm,
    path_concordant_fraction_5km: delta.pathConcordantFraction5km,
    watershed_fraction_before: before.dominantWatershedFraction,
    watershed_fraction_after: after.dominantWatershedFraction,
    max_accumulation_before: before.maxAccumulationCells,
    max_accumulation_after: after.maxAccumulationCells,
    principal_path_km_before: before.principalPathKm,
    principal_path_km_after: after.principalPathKm,
    interpretation_status: record.interpretationStatus,
  };
}

function toCsv(record) {
  const row = flatSummary(record);
  const fields = Object.keys(row);
  return `${fields.join(',')}\n${fields.map((field) => csvEscape(row[field])).join(',')}\n`;
}

function pathPoints(path, meta) {
  if (!Array.isArray(path) || path.length === 0) return '';
  return path.map((point) => {
    const x = (point.lon - meta.lonFloor) * 360;
    const y = (meta.latFloor + 1 - point.lat) * 240;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function renderPathPreview(record) {
  const svg = document.getElementById('scenarioPathPreview');
  if (!svg) return;
  const before = pathPoints(record.hydrology.before.principalPath, record.sourceDem);
  const after = pathPoints(record.hydrology.after.principalPath, record.sourceDem);
  svg.innerHTML = `
    <rect x="0" y="0" width="360" height="240" fill="rgba(2,6,12,.72)" />
    <polyline points="${before}" fill="none" stroke="#ffd36a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <polyline points="${after}" fill="none" stroke="#4fe3ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <text x="12" y="22" fill="#ffd36a" font-size="13">PRZED — źródłowy Copernicus DEM</text>
    <text x="12" y="42" fill="#4fe3ff" font-size="13">PO — hipotetyczna warstwa zmian</text>`;
}

function renderRecord(record) {
  const rows = document.getElementById('scenarioComparisonRows');
  if (!rows) return;
  const before = record.hydrology.before;
  const after = record.hydrology.after;
  const delta = record.hydrology.delta;
  rows.innerHTML = `
    <tr><td>Obiekty scenariusza</td><td colspan="2"><strong>${record.edits.length}</strong> (góry + doliny odczytane z aktywnej sceny 3D)</td></tr>
    <tr><td>Źródłowy DEM zmodyfikowany?</td><td colspan="2"><strong>${record.sourceDemMutated ? 'TAK — BŁĄD' : 'NIE — źródło pozostało nienaruszone'}</strong></td></tr>
    <tr><td>Bilans projektowy 1:1</td><td>wykop ${fmt(record.rasterization.designCutKm3)} km³</td><td>nasyp ${fmt(record.rasterization.designFillKm3)} km³ • bank ${fmt(record.rasterization.designBankKm3)} km³</td></tr>
    <tr><td>Komórki DEM objęte deltą</td><td colspan="2">${record.rasterization.changedCellCount}/${SAMPLE_SIZE * SAMPLE_SIZE} • ${percent(record.rasterization.changedCellFraction)} • max |Δ| ${fmt(record.rasterization.maxAbsDeltaM, 0)} m</td></tr>
    <tr><td>Rasteryzowana objętość diagnostyczna</td><td>wykop ${fmt(record.rasterization.rasterizedCutKm3)} km³</td><td>nasyp ${fmt(record.rasterization.rasterizedFillKm3)} km³</td></tr>
    <tr><td>Dominująca zlewnia</td><td>PRZED ${percent(before.dominantWatershedFraction)}</td><td>PO ${percent(after.dominantWatershedFraction)}</td></tr>
    <tr><td>Maks. akumulacja D8</td><td>PRZED ${fmt(before.maxAccumulationCells, 0)} kom.</td><td>PO ${fmt(after.maxAccumulationCells, 0)} kom.</td></tr>
    <tr><td>Zmiana odbiorcy D8</td><td colspan="2">${delta.receiverChangedCells} kom. • ${percent(delta.receiverChangedFraction)}</td></tr>
    <tr><td>Przesunięcie dominującego odpływu</td><td colspan="2">${fmt(delta.outletDistanceKm, 1)} km</td></tr>
    <tr><td>Główna ścieżka odpływu</td><td>PRZED ${fmt(before.principalPathKm, 1)} km</td><td>PO ${fmt(after.principalPathKm, 1)} km</td></tr>
    <tr><td>Zgodność ścieżek ≤5 km</td><td colspan="2">${percent(delta.pathConcordantFraction5km)} • śr. odległość ${fmt(delta.pathMeanNearestKm, 1)} km</td></tr>`;
  renderPathPreview(record);
}

async function runComparison() {
  const button = document.getElementById('runScenarioComparison');
  const status = document.getElementById('scenarioComparisonStatus');
  if (!button || !status) return;
  button.disabled = true;
  status.textContent = 'Pobieranie niezmienionego źródłowego Copernicus DEM i budowa wariantu PO…';
  try {
    const state = window.__getSaharaScenarioState?.();
    if (!state?.site) throw new Error('Nie znaleziono aktywnej sceny Sahara.');
    const source = await loadSourceDem(state.site);
    const record = buildScenarioComparisonRecord(state, source.values, {
      site: state.site,
      latFloor: source.latFloor,
      lonFloor: source.lonFloor,
      tileUrl: source.tileUrl,
    });
    latestRecord = record;
    stale = false;
    window.__saharaScenarioHydrologyComparison = record;
    renderRecord(record);
    document.getElementById('downloadScenarioComparisonJson').disabled = false;
    document.getElementById('downloadScenarioComparisonCsv').disabled = false;
    status.textContent = `Gotowe: PRZED vs PO dla ${record.edits.length} obiektów. Źródłowy DEM pozostał nienaruszony: ${record.sourceDemMutated ? 'NIE' : 'TAK'}.`;
  } catch (error) {
    status.textContent = `Analiza PRZED vs PO nie została ukończona: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

function updateLiveStatus(state) {
  const live = document.getElementById('scenarioLiveState');
  if (!live || !state) return;
  const mountains = state.edits.filter((edit) => edit.kind === 'mountain').length;
  const valleys = state.edits.filter((edit) => edit.kind === 'valley').length;
  live.textContent = `Aktywna scena: ${mountains} gór • ${valleys} dolin • bank materiału ${fmt(state.materialBalance.bankKm3)} km³.`;
  if (latestRecord) {
    stale = true;
    const status = document.getElementById('scenarioComparisonStatus');
    if (status) status.textContent = 'Scena zmieniła się od ostatniego obliczenia — uruchom PRZED vs PO ponownie.';
  }
}

export function mountScenarioHydrologyComparison() {
  if (document.getElementById('scenario-dem-before-after')) return false;
  const anchor = document.querySelector('.metrics') || document.querySelector('.lab-layout');
  if (!anchor) return false;
  const panel = document.createElement('section');
  panel.id = 'scenario-dem-before-after';
  panel.className = 'panel research-section';
  panel.innerHTML = `
    <div class="eyebrow">EKSPERYMENT 3 / PRZED VS PO / COPERNICUS DEM + D8</div>
    <h2>Hipotetyczna warstwa zmian terenu bez nadpisywania prawdziwego DEM</h2>
    <p>Moduł odczytuje dokładne, bieżące pozycje i wymiary gór oraz dolin z aktywnej sceny Three.js. Źródłowy kafel Copernicus DEM jest kopiowany do osobnej tablicy scenariusza; dopiero na tej kopii nakładane są dodatnie delty gór i ujemne delty trapezowych dolin.</p>
    <p id="scenarioLiveState" class="method-note">Odczytywanie aktywnej sceny…</p>
    <div class="button-grid compact">
      <button id="runScenarioComparison" class="action" type="button">Policz PRZED vs PO</button>
      <button id="downloadScenarioComparisonJson" type="button" disabled>Pobierz scenariusz JSON</button>
      <button id="downloadScenarioComparisonCsv" type="button" disabled>Pobierz podsumowanie CSV</button>
    </div>
    <p id="scenarioComparisonStatus" class="action-message" role="status" aria-live="polite">Gotowe do analizy. Po przesunięciu lub zmianie obiektów uruchom obliczenie ponownie.</p>
    <div class="two-col">
      <div class="tablewrap"><table><thead><tr><th>Wskaźnik</th><th>PRZED</th><th>PO / różnica</th></tr></thead><tbody id="scenarioComparisonRows"><tr><td colspan="3">Brak wyniku.</td></tr></tbody></table></div>
      <div><svg id="scenarioPathPreview" viewBox="0 0 360 240" role="img" aria-label="Porównanie głównej ścieżki odpływu przed i po hipotetycznej zmianie DEM" style="width:100%;min-height:240px;border-radius:12px;background:#02060c"></svg></div>
    </div>
    <p class="method-note"><strong>Rozdział danych:</strong> Copernicus DEM pozostaje obserwacją źródłową. Warstwa PO jest wyłącznie hipotetyczną deltą modelową. D8, Priority-Flood i przesunięcie odpływu opisują reakcję tego modelu numerycznego — nie prognozę klimatu, nie pojemność zbiornika i nie zalecenie wykonania robót ziemnych.</p>
    <p class="method-note"><strong>Objętości:</strong> „bilans projektowy” pochodzi z dokładnej geometrii brył 1:1. „Rasteryzowana objętość” jest tylko diagnostyką siatki 33×33 i może różnić się od objętości projektowej przez rozdzielczość próbkowania.</p>`;
  anchor.insertAdjacentElement('afterend', panel);

  document.getElementById('runScenarioComparison').addEventListener('click', runComparison);
  document.getElementById('downloadScenarioComparisonJson').addEventListener('click', () => {
    if (!latestRecord || stale) return;
    downloadText(
      'sahara_scenario_dem_before_after.json',
      'application/json',
      `${JSON.stringify(latestRecord, null, 2)}\n`,
    );
  });
  document.getElementById('downloadScenarioComparisonCsv').addEventListener('click', () => {
    if (!latestRecord || stale) return;
    downloadText('sahara_scenario_dem_before_after.csv', 'text/csv;charset=utf-8', toCsv(latestRecord));
  });

  window.addEventListener('sahara:scenario-changed', (event) => updateLiveStatus(event.detail?.state));
  updateLiveStatus(window.__getSaharaScenarioState?.());
  return true;
}

mountScenarioHydrologyComparison();
