const VV_SERVICE = 'https://gis.earthdata.nasa.gov/image/rest/services/OPERA_L2_RTC_S1_V1/OPERA_L2_RTC_S1_V1_VV/ImageServer';
const RASTER_FUNCTION = 'Sentinel-1 RTC dB Stretch';
const MANIFEST_URL = './paleoriver-tests/manifest.json';
const LABELS_URL = './paleoriver-tests/sar_reference_labels_v1.json';
const SOURCE_URL = './paleoriver-tests/sar_source_manifest_v1.json';

let sarPromise = null;

function centerOfBbox(bbox) {
  return {
    lon: (Number(bbox[0]) + Number(bbox[2])) / 2,
    lat: (Number(bbox[1]) + Number(bbox[3])) / 2,
  };
}

function safeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isoDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildSarQueryUrl(test) {
  const center = centerOfBbox(test.bbox);
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${center.lon},${center.lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'objectid,name,polarization,startdate,enddate,downloadurl,urldisplay',
    returnGeometry: 'false',
    orderByFields: 'startdate DESC',
    resultRecordCount: '1',
    f: 'json',
  });
  return `${VV_SERVICE}/query?${params.toString()}`;
}

export function buildSarExportUrl(test, objectId) {
  const params = new URLSearchParams({
    bbox: test.bbox.join(','),
    bboxSR: '4326',
    imageSR: '4326',
    size: '720,480',
    format: 'png32',
    interpolation: 'RSP_BilinearInterpolation',
    mosaicRule: JSON.stringify({
      mosaicMethod: 'esriMosaicLockRaster',
      lockRasterIds: [Number(objectId)],
      ascending: false,
    }),
    renderingRule: JSON.stringify({ rasterFunction: RASTER_FUNCTION }),
    f: 'image',
  });
  return `${VV_SERVICE}/exportImage?${params.toString()}`;
}

async function previewLuma(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 120;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve({ mean: null, std: null, status: 'canvas-unavailable' });
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const values = [];
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index + 3] < 32) continue;
          values.push(0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]);
        }
        if (!values.length) {
          resolve({ mean: null, std: null, status: 'empty-preview' });
          return;
        }
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        resolve({ mean: Number(mean.toFixed(2)), std: Number(Math.sqrt(variance).toFixed(2)), status: 'preview-luma' });
      } catch (error) {
        resolve({ mean: null, std: null, status: `preview-unreadable:${error?.name || 'error'}` });
      }
    };
    image.onerror = () => resolve({ mean: null, std: null, status: 'preview-load-failed' });
    image.src = url;
  });
}

async function fetchLatestSar(test, label) {
  const response = await fetch(buildSarQueryUrl(test), { cache: 'no-store' });
  if (!response.ok) throw new Error(`NASA ImageServer ${response.status}`);
  const payload = await response.json();
  const attributes = payload.features?.[0]?.attributes;
  if (!attributes) {
    return {
      id: test.id,
      status: 'no-raster-intersecting-test-center',
      hydrologic_context_label: label?.hydrologic_context_label ?? null,
      context_label_confidence: label?.context_label_confidence ?? null,
      paleochannel_ground_truth: label?.paleochannel_ground_truth ?? 'not-labelled',
    };
  }
  const objectId = Number(attributes.objectid);
  const exportUrl = buildSarExportUrl(test, objectId);
  const luma = await previewLuma(exportUrl);
  return {
    id: test.id,
    status: 'ok',
    source: 'NASA OPERA RTC-S1 / Sentinel-1',
    service: VV_SERVICE,
    objectid: objectId,
    product_name: attributes.name ?? null,
    polarization: attributes.polarization ?? 'VV',
    acquisition_start: isoDate(attributes.startdate),
    acquisition_end: isoDate(attributes.enddate),
    product_download_url: attributes.downloadurl ?? null,
    product_display_url: attributes.urldisplay ?? null,
    preview_url: exportUrl,
    preview_mean_luma: luma.mean,
    preview_std_luma: luma.std,
    sar_feature_status: luma.status,
    sar_feature_kind: 'rendered-preview-intensity-not-calibrated-backscatter',
    hydrologic_context_label: label?.hydrologic_context_label ?? null,
    context_label_confidence: label?.context_label_confidence ?? null,
    paleochannel_ground_truth: label?.paleochannel_ground_truth ?? 'not-labelled',
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Nie można pobrać ${url}`);
  return response.json();
}

export async function ensureSar8() {
  if (Array.isArray(window.__paleoriverSar8) && window.__paleoriverSar8.length === 8) {
    return window.__paleoriverSar8;
  }
  if (sarPromise) return sarPromise;
  sarPromise = (async () => {
    const [manifest, labelsPayload, source] = await Promise.all([
      fetchJson(MANIFEST_URL),
      fetchJson(LABELS_URL),
      fetchJson(SOURCE_URL),
    ]);
    const labels = new Map(labelsPayload.labels.map((label) => [label.id, label]));
    const rows = [];
    for (const test of manifest.tests) {
      try {
        // Sequential requests are deliberate to avoid hammering the public NASA image service.
        // eslint-disable-next-line no-await-in-loop
        rows.push(await fetchLatestSar(test, labels.get(test.id)));
      } catch (error) {
        rows.push({
          id: test.id,
          status: 'service-error',
          error: error?.message || 'unknown-error',
          hydrologic_context_label: labels.get(test.id)?.hydrologic_context_label ?? null,
          context_label_confidence: labels.get(test.id)?.context_label_confidence ?? null,
          paleochannel_ground_truth: labels.get(test.id)?.paleochannel_ground_truth ?? 'not-labelled',
        });
      }
    }
    window.__paleoriverSar8 = rows;
    window.__paleoriverSarSource = source;
    return rows;
  })();
  try {
    return await sarPromise;
  } finally {
    sarPromise = null;
  }
}

function csvText(records) {
  if (!records.length) return '';
  const fields = [
    'id', 'status', 'product_name', 'polarization', 'acquisition_start',
    'preview_mean_luma', 'preview_std_luma', 'sar_feature_status',
    'hydrologic_context_label', 'context_label_confidence', 'paleochannel_ground_truth',
  ];
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

function renderRows(rows) {
  const host = document.getElementById('sarPreviewRows');
  if (!host) return;
  host.innerHTML = '';
  for (const row of rows) {
    const acquisition = row.acquisition_start ? row.acquisition_start.slice(0, 10) : '—';
    const preview = row.preview_url
      ? `<img src="${safeText(row.preview_url)}" alt="Sentinel-1 SAR ${safeText(row.id)}" loading="lazy" crossorigin="anonymous" style="width:180px;max-width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:.45rem;background:#07111d">`
      : '<span>brak podglądu</span>';
    host.insertAdjacentHTML('beforeend', `
      <tr>
        <td><strong>${safeText(row.id)}</strong><br><small>${safeText(row.hydrologic_context_label || 'bez etykiety')}</small></td>
        <td>${preview}</td>
        <td>${safeText(acquisition)}<br><small>${safeText(row.polarization || 'VV')}</small></td>
        <td>${row.preview_mean_luma == null ? '—' : row.preview_mean_luma}<br><small>σ ${row.preview_std_luma == null ? '—' : row.preview_std_luma}</small></td>
        <td>${safeText(row.status)}</td>
      </tr>`);
  }
}

async function runSarPanel() {
  const button = document.getElementById('loadSar8');
  const status = document.getElementById('sarPreviewStatus');
  if (!button || !status) return;
  button.disabled = true;
  status.textContent = 'NASA OPERA RTC-S1: wyszukiwanie najnowszego rastra dla 8 lokalizacji…';
  try {
    const rows = await ensureSar8();
    renderRows(rows);
    document.getElementById('downloadSarJson').disabled = false;
    document.getElementById('downloadSarCsv').disabled = false;
    const ok = rows.filter((row) => row.status === 'ok').length;
    status.textContent = `Gotowe: ${ok}/8 lokalizacji ma raster Sentinel-1 RTC przecinający punkt testowy. Statystyka jasności jest cechą obrazu podglądowego, nie skalibrowanym backscatterem.`;
  } catch (error) {
    status.textContent = `SAR nie został ukończony: ${error?.message || 'błąd'}`;
  } finally {
    button.disabled = false;
  }
}

export function mountSarPreview() {
  const suite = document.getElementById('paleoriver-test-suite');
  if (!suite || document.getElementById('sar-preview-8')) return false;
  const panel = document.createElement('div');
  panel.id = 'sar-preview-8';
  panel.className = 'panel';
  panel.style.marginTop = '1rem';
  panel.innerHTML = `
    <div class="eyebrow">SENTINEL-1 SAR / NASA OPERA RTC-S1 / 8 TESTÓW</div>
    <h3>Radarowa warstwa kontrolna dla ośmiu przypadków</h3>
    <p>Moduł odpytuje oficjalny NASA Earthdata ImageServer dla OPERA Level-2 RTC-S1 w polaryzacji VV i wybiera najnowszy raster przecinający punkt centralny każdego testu. Starsze daty optyczne nie są sztucznie przypisywane do SAR: OPERA RTC-S1 zaczyna się w 2023 r.</p>
    <div class="button-grid compact">
      <button id="loadSar8" class="action" type="button">Załaduj Sentinel-1 SAR dla 8 testów</button>
      <button id="downloadSarJson" type="button" disabled>Pobierz SAR JSON</button>
      <button id="downloadSarCsv" type="button" disabled>Pobierz SAR CSV</button>
    </div>
    <p id="sarPreviewStatus" class="action-message" role="status" aria-live="polite">Warstwa SAR czeka na uruchomienie.</p>
    <div class="tablewrap"><table><thead><tr><th>Test / etykieta kontekstu</th><th>RTC-S1 VV</th><th>Akwizycja</th><th>Jasność podglądu</th><th>Status</th></tr></thead><tbody id="sarPreviewRows"></tbody></table></div>
    <p class="method-note"><strong>Rozdział danych i wniosku:</strong> etykiety opisują tylko kontekst hydrologiczny potwierdzony przez cytowane źródło urzędowe. <code>paleochannel_ground_truth</code> pozostaje <code>not-labelled</code>. Jasność podglądu SAR nie jest wilgotnością gleby ani skalibrowanym współczynnikiem odbicia.</p>`;
  suite.appendChild(panel);
  document.getElementById('loadSar8').addEventListener('click', runSarPanel);
  document.getElementById('downloadSarJson').addEventListener('click', () => download(
    'paleoriver_sentinel1_sar_8.json',
    'application/json',
    `${JSON.stringify(window.__paleoriverSar8 || [], null, 2)}\n`,
  ));
  document.getElementById('downloadSarCsv').addEventListener('click', () => download(
    'paleoriver_sentinel1_sar_8.csv',
    'text/csv;charset=utf-8',
    csvText(window.__paleoriverSar8 || []),
  ));
  return true;
}

mountSarPreview();
