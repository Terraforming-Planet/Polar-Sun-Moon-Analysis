from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"

MOSAIC_CORE = r'''export const MOSAIC_TILE_RADIUS = 1;
export const MOSAIC_TILE_SAMPLE_SIZE = 17;

export function mosaicTileOrigins(lat, lon, radius = MOSAIC_TILE_RADIUS) {
  const baseLat = Math.floor(lat);
  const baseLon = Math.floor(lon);
  const origins = [];
  for (let row = 0; row < radius * 2 + 1; row += 1) {
    const latFloor = baseLat + radius - row;
    for (let col = 0; col < radius * 2 + 1; col += 1) {
      origins.push({
        row,
        col,
        latFloor,
        lonFloor: baseLon - radius + col,
      });
    }
  }
  return origins;
}

export function stitchedSize(radius = MOSAIC_TILE_RADIUS, tileSampleSize = MOSAIC_TILE_SAMPLE_SIZE) {
  return (radius * 2 + 1) * (tileSampleSize - 1) + 1;
}

export function stitchDemTiles(tiles, radius = MOSAIC_TILE_RADIUS, tileSampleSize = MOSAIC_TILE_SAMPLE_SIZE) {
  const size = stitchedSize(radius, tileSampleSize);
  const values = new Float64Array(size * size);
  const written = new Uint8Array(size * size);

  for (const tile of tiles) {
    if (!tile || tile.values.length !== tileSampleSize * tileSampleSize) {
      throw new Error('Invalid DEM tile sample for mosaic');
    }
    const rowStart = tile.row * (tileSampleSize - 1);
    const colStart = tile.col * (tileSampleSize - 1);
    for (let row = 0; row < tileSampleSize; row += 1) {
      for (let col = 0; col < tileSampleSize; col += 1) {
        const target = (rowStart + row) * size + colStart + col;
        const source = row * tileSampleSize + col;
        if (!written[target]) {
          values[target] = Number(tile.values[source]);
          written[target] = 1;
        }
      }
    }
  }

  for (const flag of written) {
    if (!flag) throw new Error('DEM mosaic has unwritten cells');
  }
  return { values, width: size, height: size };
}
'''

MOSAIC_LOADER = r'''import {
  MOSAIC_TILE_RADIUS,
  MOSAIC_TILE_SAMPLE_SIZE,
  mosaicTileOrigins,
  stitchDemTiles,
} from './sahara-dem-mosaic-core.js';

const COPERNICUS_DEM_90M = 'https://copernicus-dem-90m.s3.amazonaws.com';
const GEOTIFF_MODULE_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';

function tileCode(latFloor, lonFloor) {
  const latHemisphere = latFloor >= 0 ? 'N' : 'S';
  const lonHemisphere = lonFloor >= 0 ? 'E' : 'W';
  const latCode = `${latHemisphere}${String(Math.abs(latFloor)).padStart(2, '0')}_00`;
  const lonCode = `${lonHemisphere}${String(Math.abs(lonFloor)).padStart(3, '0')}_00`;
  return `${latCode}_${lonCode}`;
}

export function mosaicDemTileUrl(latFloor, lonFloor) {
  const code = tileCode(latFloor, lonFloor);
  const name = `Copernicus_DSM_COG_30_${code}_DEM`;
  return `${COPERNICUS_DEM_90M}/${name}/${name}.tif`;
}

async function loadTile(fromUrl, origin, tileSampleSize) {
  const url = mosaicDemTileUrl(origin.latFloor, origin.lonFloor);
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const values = await image.readRasters({
    width: tileSampleSize,
    height: tileSampleSize,
    interleave: true,
    resampleMethod: 'bilinear',
  });
  return { ...origin, values, url };
}

export async function loadCopernicusDemMosaic(lat, lon, options = {}) {
  const radius = options.radius ?? MOSAIC_TILE_RADIUS;
  const tileSampleSize = options.tileSampleSize ?? MOSAIC_TILE_SAMPLE_SIZE;
  const origins = mosaicTileOrigins(lat, lon, radius);
  const { fromUrl } = await import(GEOTIFF_MODULE_URL);
  const tiles = await Promise.all(origins.map((origin) => loadTile(fromUrl, origin, tileSampleSize)));
  const stitched = stitchDemTiles(tiles, radius, tileSampleSize);
  const baseLat = Math.floor(lat);
  const baseLon = Math.floor(lon);
  return {
    ...stitched,
    tiles,
    tileCount: tiles.length,
    latNorth: baseLat + radius + 1,
    latSouth: baseLat - radius,
    lonWest: baseLon - radius,
    lonEast: baseLon + radius + 1,
    latSpanDeg: radius * 2 + 1,
    lonSpanDeg: radius * 2 + 1,
  };
}
'''

for root in (WEB, DOCS):
    (root / "sahara-dem-mosaic-core.js").write_text(MOSAIC_CORE, encoding="utf-8")
    (root / "sahara-dem-mosaic.js").write_text(MOSAIC_LOADER, encoding="utf-8")

flow_path = WEB / "sahara-flow-core.js"
flow = flow_path.read_text(encoding="utf-8")
anchor = "export function buildFlowProducts(values, lat, options = {}) {"
if "export function buildFlowProductsGrid" not in flow:
    generic = r'''
function gridCellDistances(lat, width, height, latSpanDeg, lonSpanDeg) {
  const dLat = Math.PI / 180 * latSpanDeg / Math.max(1, height - 1);
  const dLon = Math.PI / 180 * lonSpanDeg / Math.max(1, width - 1);
  return {
    northSouth: EARTH_RADIUS_M * dLat,
    eastWest: Math.max(1, Math.abs(EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180) * dLon)),
  };
}

function gridBoundaryIndices(width, height) {
  const indices = [];
  for (let col = 0; col < width; col += 1) {
    indices.push(col);
    indices.push((height - 1) * width + col);
  }
  for (let row = 1; row < height - 1; row += 1) {
    indices.push(row * width);
    indices.push(row * width + width - 1);
  }
  return indices;
}

function conditionGridDem(elevations, width, height, epsilonM) {
  const conditioned = Float64Array.from(elevations);
  const fillDepth = new Float64Array(elevations.length);
  const visited = new Uint8Array(elevations.length);
  const heap = [];
  for (const index of gridBoundaryIndices(width, height)) {
    if (visited[index]) continue;
    visited[index] = 1;
    pushHeap(heap, [conditioned[index], index]);
  }
  while (heap.length > 0) {
    const item = popHeap(heap);
    if (!item) break;
    const [spillElevation, index] = item;
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [dr, dc] of D8_NEIGHBORS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const neighbor = nr * width + nc;
      if (visited[neighbor]) continue;
      visited[neighbor] = 1;
      const original = conditioned[neighbor];
      const minimumDrainable = spillElevation + epsilonM;
      if (original <= spillElevation) {
        conditioned[neighbor] = minimumDrainable;
        fillDepth[neighbor] = Math.max(0, minimumDrainable - elevations[neighbor]);
      }
      pushHeap(heap, [conditioned[neighbor], neighbor]);
    }
  }
  return { conditioned, fillDepth };
}

function computeGridReceivers(elevations, width, height, distances) {
  const receivers = new Int32Array(elevations.length);
  receivers.fill(-1);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      let bestReceiver = -1;
      let bestGradient = 0;
      for (const [dr, dc] of D8_NEIGHBORS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const neighbor = nr * width + nc;
        const drop = elevations[index] - elevations[neighbor];
        if (drop <= 0) continue;
        const gradient = drop / neighborDistance(dr, dc, distances);
        if (gradient > bestGradient) {
          bestGradient = gradient;
          bestReceiver = neighbor;
        }
      }
      receivers[index] = bestReceiver;
    }
  }
  return receivers;
}

export function buildFlowProductsGrid(values, options) {
  const width = options.width;
  const height = options.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error('Flow grid requires width and height >= 2');
  }
  const elevations = Array.from(values, (value) => finiteElevation(Number(value)));
  if (elevations.length !== width * height) {
    throw new Error(`Expected ${width * height} DEM samples, got ${elevations.length}`);
  }
  const epsilonM = options.epsilonM ?? FLAT_EPSILON_M;
  const conditioned = conditionGridDem(elevations, width, height, epsilonM);
  const distances = gridCellDistances(
    options.lat,
    width,
    height,
    options.latSpanDeg ?? 1,
    options.lonSpanDeg ?? 1,
  );
  const receivers = computeGridReceivers(conditioned.conditioned, width, height, distances);
  const accumulation = computeFlowAccumulation(receivers);
  let dominantOutlet = 0;
  for (let index = 1; index < accumulation.length; index += 1) {
    if (accumulation[index] > accumulation[dominantOutlet]) dominantOutlet = index;
  }
  const watershed = delineateWatershed(receivers, dominantOutlet);
  let filledCellCount = 0;
  let maxFillDepthM = 0;
  let fillDepthSumM = 0;
  for (const depth of conditioned.fillDepth) {
    if (depth <= epsilonM) continue;
    filledCellCount += 1;
    fillDepthSumM += depth;
    maxFillDepthM = Math.max(maxFillDepthM, depth);
  }
  return {
    elevations,
    routingElevations: conditioned.conditioned,
    receivers,
    accumulation,
    dominantOutlet,
    watershed,
    conditioning: {
      filledCellCount,
      filledFraction: filledCellCount / elevations.length,
      meanFillDepthM: filledCellCount > 0 ? fillDepthSumM / filledCellCount : 0,
      maxFillDepthM,
      cellAreaM2: distances.northSouth * distances.eastWest,
    },
  };
}

'''
    if anchor not in flow:
        raise SystemExit("flow-core anchor missing")
    flow = flow.replace(anchor, generic + anchor, 1)
    flow_path.write_text(flow, encoding="utf-8")
    (DOCS / "sahara-flow-core.js").write_text(flow, encoding="utf-8")

for root in (WEB, DOCS):
    path = root / "sahara-hydrology.js"
    text = path.read_text(encoding="utf-8")
    import_anchor = "import { copernicusDemTileUrl } from './sahara-dem-relief.js';\n"
    if "sahara-dem-mosaic.js" not in text:
        text = text.replace(
            import_anchor,
            import_anchor + "import { loadCopernicusDemMosaic } from './sahara-dem-mosaic.js';\n",
            1,
        )
    if "buildFlowProductsGrid" not in text:
        text = text.replace(
            "  buildFlowProducts,\n",
            "  buildFlowProducts,\n  buildFlowProductsGrid,\n",
            1,
        )
    marker = "function percent(value) {"
    if "function mosaicFlowScreening" not in text:
        addition = r'''function mosaicFlowScreening(mosaic, lat) {
  const products = buildFlowProductsGrid(mosaic.values, {
    width: mosaic.width,
    height: mosaic.height,
    lat,
    latSpanDeg: mosaic.latSpanDeg,
    lonSpanDeg: mosaic.lonSpanDeg,
  });
  return {
    mosaicTileCount: mosaic.tileCount,
    mosaicGridWidth: mosaic.width,
    mosaicGridHeight: mosaic.height,
    mosaicFlowAccumulationMaxCells: products.accumulation[products.dominantOutlet],
    mosaicDominantWatershedFraction: products.watershed.size / products.accumulation.length,
    mosaicConditionedFilledFraction: products.conditioning.filledFraction,
    mosaicConditionedMaxFillDepthM: products.conditioning.maxFillDepthM,
    mosaicDominantOutletIndex: products.dominantOutlet,
  };
}

'''
        if marker not in text:
            raise SystemExit("hydrology marker missing")
        text = text.replace(marker, addition + marker, 1)
    old = "        const { values, url } = await loadDemAt(center.lat, center.lon);\n        const metrics = analyzeDemGrid(values, center.lat);\n        results.push({ id: test.id, name: test.name, center, demUrl: url, ...metrics });\n        rows.insertAdjacentHTML('beforeend', rowHtml(test, metrics));"
    new = "        const [{ values, url }, mosaic] = await Promise.all([\n          loadDemAt(center.lat, center.lon),\n          loadCopernicusDemMosaic(center.lat, center.lon),\n        ]);\n        const metrics = analyzeDemGrid(values, center.lat);\n        const mosaicFlow = mosaicFlowScreening(mosaic, center.lat);\n        const combined = { ...metrics, ...mosaicFlow };\n        results.push({ id: test.id, name: test.name, center, demUrl: url, ...combined });\n        rows.insertAdjacentHTML('beforeend', rowHtml(test, combined));"
    if old in text:
        text = text.replace(old, new, 1)
    elif "loadCopernicusDemMosaic(center.lat, center.lon)" not in text:
        raise SystemExit("hydrology run anchor missing")
    text = text.replace(
        "'conditionedNumericalFillVolumeM3', 'conditionedInteriorSinkCount',\n",
        "'conditionedNumericalFillVolumeM3', 'conditionedInteriorSinkCount',\n    'mosaicTileCount', 'mosaicGridWidth', 'mosaicGridHeight', 'mosaicFlowAccumulationMaxCells',\n    'mosaicDominantWatershedFraction', 'mosaicConditionedFilledFraction',\n    'mosaicConditionedMaxFillDepthM', 'mosaicDominantOutletIndex',\n",
        1,
    )
    text = text.replace(
        "status.textContent = `Copernicus DEM + Priority-Flood + D8: ${index + 1}/${manifest.tests.length} — ${test.name}`;",
        "status.textContent = `Copernicus DEM 3×3 + Priority-Flood + D8: ${index + 1}/${manifest.tests.length} — ${test.name}`;",
        1,
    )
    text = text.replace(
        "Regionalna próbka 33×33 wokół środka każdego testu zachowuje surowy DEM do oceny reliefu i retencji, a osobną kopię numerycznie kondycjonuje metodą Priority-Flood.",
        "Centralna próbka 33×33 zachowuje szybki screening reliefu i retencji, a równolegle mozaika 3×3 kafli Copernicus DEM rozszerza trasowanie D8 poza granicę pojedynczego stopnia geograficznego.",
        1,
    )
    text = text.replace(
        "Uruchom Priority-Flood + D8 dla 8 testów",
        "Uruchom DEM 3×3 + Priority-Flood + D8 dla 8 testów",
        1,
    )
    text = text.replace(
        "Gotowe: ${completed}/${manifest.tests.length} próbek DEM z kondycjonowaniem i D8.",
        "Gotowe: ${completed}/${manifest.tests.length} przypadków z centralnym DEM i mozaiką 3×3, kondycjonowaniem i D8.",
        1,
    )
    path.write_text(text, encoding="utf-8")

note = ROOT / "data" / "training" / "paleoriver_8" / "research_note_iteration_7.md"
note.write_text("""# Sahara Station — research note, iteration 7\n\n## Observation\n\nDotychczasowe trasowanie D8 używało pojedynczego kafla DEM 1°×1°. Punkt odpływu mógł więc być wymuszany przez sztuczną granicę próbki, a zlewnia mogła być ucięta przed naturalnym dalszym biegiem.\n\n## Zmiana techniczna\n\nDodano mozaikę 3×3 kafle Copernicus DEM wokół każdego z ośmiu przypadków. Każdy kafel jest próbkowany do 17×17 komórek i składany bez podwajania wspólnych krawędzi do siatki 49×49 obejmującej około 3°×3°. D8 i Priority-Flood działają teraz także na tej większej siatce. Centralny screening 33×33 pozostaje równolegle, aby zachować porównywalność z poprzednimi iteracjami.\n\n## Wniosek roboczy\n\nJeżeli dominujący odpływ i koncentracja przepływu pozostają podobne po rozszerzeniu z 1°×1° do 3°×3°, hipoteza lokalnego kierunku drenażu staje się odporniejsza na artefakt granicy kafla. Jeżeli wynik zmienia się mocno, wcześniejszy pojedynczy kafel należy traktować jako niewystarczający.\n\n## Ograniczenia\n\nTo nadal screening geomorfologiczny. Copernicus DEM jest DSM, a D8 po Priority-Flood nie dowodzi istnienia dawnej rzeki ani nie wylicza realnej pojemności retencyjnej. Potwierdzenie wymaga zgodności z obrazami optycznymi/SAR, geologią, osadami, większą zlewnią oraz — tam gdzie dostępne — obserwacjami terenowymi.\n""", encoding="utf-8")

test_path = ROOT / "tests" / "test_sahara_dem_mosaic.py"
test_path.write_text(r'''import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"


def test_mosaic_runtime_is_published_identically() -> None:
    for name in ("sahara-dem-mosaic-core.js", "sahara-dem-mosaic.js"):
        assert (WEB / name).read_text(encoding="utf-8") == (DOCS / name).read_text(encoding="utf-8")
    assert (WEB / "sahara-flow-core.js").read_text(encoding="utf-8") == (
        DOCS / "sahara-flow-core.js"
    ).read_text(encoding="utf-8")
    hydrology = (WEB / "sahara-hydrology.js").read_text(encoding="utf-8")
    assert hydrology == (DOCS / "sahara-hydrology.js").read_text(encoding="utf-8")
    assert "loadCopernicusDemMosaic" in hydrology
    assert "buildFlowProductsGrid" in hydrology
    assert "DEM 3×3" in hydrology


def test_mosaic_core_stitches_nine_tiles_without_duplicate_edges() -> None:
    if not shutil.which("node"):
        pytest.skip("node is not installed")
    module_uri = (WEB / "sahara-dem-mosaic-core.js").resolve().as_uri()
    script = f'''\nimport {{ mosaicTileOrigins, stitchDemTiles }} from {module_uri!r};\nconst origins = mosaicTileOrigins(10.4, 20.6);\nif (origins.length !== 9) throw new Error(`origins=${{origins.length}}`);\nconst tiles = origins.map((o, i) => ({{...o, values: Float64Array.from({{length: 9}}, () => i + 1)}}));\nconst stitched = stitchDemTiles(tiles, 1, 3);\nif (stitched.width !== 7 || stitched.height !== 7) throw new Error(`size=${{stitched.width}}`);\nif (stitched.values.length !== 49) throw new Error(`cells=${{stitched.values.length}}`);\n'''
    subprocess.run(["node", "--input-type=module", "-e", script], check=True)


def test_iteration_seven_note_exists() -> None:
    note = ROOT / "data" / "training" / "paleoriver_8" / "research_note_iteration_7.md"
    text = note.read_text(encoding="utf-8")
    assert "3×3" in text
    assert "49×49" in text
    assert "nie dowodzi" in text
''', encoding="utf-8")

print("Sahara iteration 7 files prepared")
