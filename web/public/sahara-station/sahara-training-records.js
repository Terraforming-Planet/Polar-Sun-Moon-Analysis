import { ensureSar8 } from './sahara-sar-preview.js';

const PIPELINES = [
  ['runHydrology8', '__paleoriverHydrology8'],
  ['runHydrologyMosaic8', '__paleoriverMosaicHydrology8'],
  ['runDrainageStability8', '__paleoriverDrainageStability8'],
  ['runPathConcordance8', '__paleoriverPathConcordance8'],
];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePipeline(buttonId, globalName) {
  const existing = window[globalName];
  if (Array.isArray(existing) && existing.length >= 8) return existing;
  const button = document.getElementById(buttonId);
  if (!button) throw new Error(`Brak modułu ${buttonId}`);
  button.click();
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await sleep(500);
    const result = window[globalName];
    if (Array.isArray(result) && result.length >= 8) return result;
    if (!button.disabled && Array.isArray(result) && result.length > 0) return result;
  }
  throw new Error(`Przekroczono czas oczekiwania na ${buttonId}`);
}

function byId(rows) {
  return new Map((rows || []).map((row) => [row.id, row]));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flattenRecord(test, optical, sar, hydro, mosaic, stability, path) {
  return {
    id: test.id,
    continent: test.continent,
    country: test.country,
    kind: test.kind,
    imagery_date: test.date,
    imagery_provider: 'NASA GIBS / MODIS Terra true color',
    reference: test.reference,
    optical_mean_r: numberOrNull(optical?.mean_r),
    optical_mean_g: numberOrNull(optical?.mean_g),
    optical_mean_b: numberOrNull(optical?.mean_b),
    sar_provider: sar?.source ?? 'NASA OPERA RTC-S1 / Sentinel-1',
    sar_status: sar?.status ?? null,
    sar_product_name: sar?.product_name ?? null,
    sar_polarization: sar?.polarization ?? null,
    sar_acquisition_start: sar?.acquisition_start ?? null,
    sar_preview_mean_luma: sar?.preview_mean_luma ?? null,
    sar_preview_std_luma: sar?.preview_std_luma ?? null,
    sar_feature_status: sar?.sar_feature_status ?? null,
    sar_feature_kind: sar?.sar_feature_kind ?? 'rendered-preview-intensity-not-calibrated-backscatter',
    hydrologic_context_label: sar?.hydrologic_context_label ?? null,
    context_label_confidence: sar?.context_label_confidence ?? null,
    paleochannel_ground_truth: sar?.paleochannel_ground_truth ?? 'not-labelled',
    dem_relief_m: hydro?.reliefM ?? null,
    dem_mean_slope_deg: hydro?.meanSlopeDeg ?? null,
    dem_low_slope_fraction: hydro?.lowSlopeFraction ?? null,
    dem_valley_fraction: hydro?.valleyFraction ?? null,
    retention_screening_score: hydro?.retentionScreeningScore ?? null,
    d8_max_accumulation_cells_1deg: hydro?.flowAccumulationMaxCells ?? null,
    dominant_watershed_fraction_1deg: hydro?.dominantWatershedFraction ?? null,
    conditioned_fraction_1deg: hydro?.conditionedFilledFraction ?? null,
    d8_max_accumulation_cells_3deg: mosaic?.maxAccumulationCells ?? null,
    dominant_watershed_fraction_3deg: mosaic?.dominantWatershedFraction ?? null,
    conditioned_fraction_3deg: mosaic?.conditionedFilledFraction ?? null,
    drainage_angle_delta_deg: stability?.angleDeltaDeg ?? null,
    drainage_watershed_delta: stability?.watershedDelta ?? null,
    drainage_stability: stability?.stability ?? null,
    path_1deg_km: path?.singlePathKm ?? null,
    path_3deg_km: path?.mosaicPathKm ?? null,
    path_mean_nearest_km: path?.meanNearestKm ?? null,
    path_concordant_fraction_25km: path?.concordantFraction ?? null,
    outlet_distance_km: path?.outletDistanceKm ?? null,
    path_concordance: path?.pathConcordance ?? null,
    evidence_note: test.evidence,
    interpretation_status: 'screening-not-geological-proof',
  };
}

function csvText(records) {
  if (!records.length) return '';
  const fields = Object.keys(records[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${fields.join(',')}\n${records.map((row) => fields.map((field) => escape(row[field])).join(',')).join('\n')}\n`;
}

function download(filename, mime, text) {
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

async function buildUnifiedRecords() {
  const button = document.getElementById('buildUnifiedTraining8');
  const status = document.getElementById('unifiedTrainingStatus');
  const rows = document.getElementById('unifiedTrainingRows');
  if (!button || !status || !rows) return;
  button.disabled = true;
  rows.innerHTML = '';
  try {
    status.textContent = 'Pobieranie oficjalnej warstwy Sentinel-1 SAR dla 8 testów…';
    const [manifestResponse, opticalResponse, sar] = await Promise.all([
      fetch('./paleoriver-tests/manifest.json', { cache: 'no-store' }),
      fetch('./paleoriver-tests/training_features.csv', { cache: 'no-store' }),
      ensureSar8(),
    ]);
    if (!manifestResponse.ok || !opticalResponse.ok) throw new Error('Nie można pobrać manifestu lub cech RGB');
    const manifest = await manifestResponse.json();
    const optical = parseCsv(await opticalResponse.text());
    const results = [];
    for (const [buttonId, globalName] of PIPELINES) {
      status.textContent = `Obliczenia DEM/D8: ${buttonId}…`;
      // Existing modules perform the real Copernicus DEM computations in-browser.
      // eslint-disable-next-line no-await-in-loop
      results.push(await ensurePipeline(buttonId, globalName));
    }
    const [hydroRows, mosaicRows, stabilityRows, pathRows] = results.map(byId);
    const opticalRows = byId(optical);
    const sarRows = byId(sar);
    const records = manifest.tests.map((test) => flattenRecord(
      test,
      opticalRows.get(test.id),
      sarRows.get(test.id),
      hydroRows.get(test.id),
      mosaicRows.get(test.id),
      stabilityRows.get(test.id),
      pathRows.get(test.id),
    ));
    window.__paleoriverUnifiedTraining8 = records;
    for (const record of records) {
      const sarDate = record.sar_acquisition_start?.slice(0, 10) ?? '—';
      rows.insertAdjacentHTML('beforeend', `<tr><td><strong>${record.id}</strong></td><td>${record.kind}</td><td>${sarDate}</td><td>${record.hydrologic_context_label ?? '—'}</td><td>${record.dem_relief_m == null ? '—' : `${Math.round(record.dem_relief_m)} m`}</td><td>${record.drainage_stability ?? '—'}</td><td>${record.path_concordance ?? '—'}</td><td>${record.retention_screening_score ?? '—'}</td></tr>`);
    }
    document.getElementById('downloadUnifiedTrainingJson').disabled = false;
    document.getElementById('downloadUnifiedTrainingCsv').disabled = false;
    status.textContent = `Gotowe: ${records.length}/8 rekordów RGB + Sentinel-1 SAR + DEM/D8. SAR luma jest cechą obrazu podglądowego, nie skalibrowanym backscatterem; paleochannel_ground_truth pozostaje not-labelled.`;
  } catch (error) {
    status.textContent = `Nie ukończono rekordów treningowych: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

export function mountUnifiedTrainingRecords() {
  const suite = document.getElementById('paleoriver-test-suite');
  if (!suite || document.getElementById('unified-training-8')) return false;
  const panel = document.createElement('div');
  panel.id = 'unified-training-8';
  panel.className = 'panel';
  panel.style.marginTop = '1rem';
  panel.innerHTML = `
    <div class="eyebrow">TRENING / 8 REKORDÓW / OPTYKA + SENTINEL-1 SAR + DEM + D8</div>
    <h3>Jeden rekord treningowy dla każdego testu satelitarnego</h3>
    <p>Moduł łączy cechy RGB z oficjalnym NASA OPERA RTC-S1/Sentinel-1, rzeczywistym Copernicus DEM, Priority-Flood, D8, mozaiką 3×3, stabilnością drenażu i zgodnością całej ścieżki 1°/3°. Etykiety SAR opisują potwierdzony kontekst hydrologiczny, ale nie tworzą sztucznej etykiety „paleorzeka = prawda”.</p>
    <div class="button-grid compact">
      <button id="buildUnifiedTraining8" class="action" type="button">Zbuduj 8 pełnych rekordów</button>
      <button id="downloadUnifiedTrainingJson" type="button" disabled>Pobierz unified JSON</button>
      <button id="downloadUnifiedTrainingCsv" type="button" disabled>Pobierz unified CSV</button>
    </div>
    <p id="unifiedTrainingStatus" class="action-message" role="status" aria-live="polite">Zunifikowany trening czeka na uruchomienie.</p>
    <div class="tablewrap"><table><thead><tr><th>ID</th><th>Typ</th><th>SAR</th><th>Etykieta kontekstu</th><th>Relief</th><th>Stabilność D8</th><th>Zgodność ścieżki</th><th>Screening retencji</th></tr></thead><tbody id="unifiedTrainingRows"></tbody></table></div>
    <p class="method-note"><strong>Ograniczenie:</strong> RGB, wyświetleniowa jasność SAR, DEM i zgodność D8 są materiałem treningowym/screeningowym. Jasność eksportowanego obrazu RTC-S1 nie jest skalibrowanym sigma0/gamma0. Bez niezależnych masek referencyjnych, geologii i danych terenowych nie wolno traktować wyniku jako automatycznej klasyfikacji dawnej rzeki.</p>`;
  suite.appendChild(panel);
  document.getElementById('buildUnifiedTraining8').addEventListener('click', buildUnifiedRecords);
  document.getElementById('downloadUnifiedTrainingJson').addEventListener('click', () => download(
    'paleoriver_unified_training_8.json',
    'application/json',
    `${JSON.stringify(window.__paleoriverUnifiedTraining8 || [], null, 2)}\n`,
  ));
  document.getElementById('downloadUnifiedTrainingCsv').addEventListener('click', () => download(
    'paleoriver_unified_training_8.csv',
    'text/csv;charset=utf-8',
    csvText(window.__paleoriverUnifiedTraining8 || []),
  ));
  return true;
}

mountUnifiedTrainingRecords();
