import {
  SAMPLE_SIZE,
  cellDistances,
  conditionDemForDrainage,
  computeD8Receivers,
  computeFlowAccumulation,
  delineateWatershed,
} from './sahara-flow-core.js';
import { compareDrainagePaths, pathLengthKm, tracePrincipalPath } from './sahara-flow-path.js';

export const SCENARIO_SCHEMA_VERSION = 1;
const MAX_ABS_SCENARIO_ELEVATION_M = 50000;

function finiteScenarioElevation(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_ABS_SCENARIO_ELEVATION_M) {
    throw new Error(`Invalid scenario elevation: ${value}`);
  }
  return number;
}

export function indexToLatLon(index, meta) {
  const row = Math.floor(index / SAMPLE_SIZE);
  const col = index % SAMPLE_SIZE;
  return {
    lat: meta.latFloor + 1 - row / (SAMPLE_SIZE - 1),
    lon: meta.lonFloor + col / (SAMPLE_SIZE - 1),
  };
}

export function latLonToLocalKm(site, lat, lon) {
  const zKm = (lat - site.lat) * 111.32;
  const meanLat = (lat + site.lat) / 2;
  const lonScale = 111.32 * Math.cos(meanLat * Math.PI / 180);
  const xKm = (lon - site.lon) * Math.max(Math.abs(lonScale), 0.01);
  return { xKm, zKm };
}

function rotatedOffset(dxKm, dzKm, rotationYRad = 0) {
  const angle = -Number(rotationYRad || 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    xKm: dxKm * cos - dzKm * sin,
    zKm: dxKm * sin + dzKm * cos,
  };
}

export function trapezoidDeltaMAt(xKm, zKm, edit) {
  const shape = edit?.shape || {};
  const baseKm = Math.max(0, Number(shape.base || 0));
  const topKm = Math.max(0, Math.min(baseKm, Number(shape.top || 0)));
  const heightKm = Math.max(0, Number(shape.height || 0));
  if (!(baseKm > 0) || !(heightKm > 0)) return 0;

  const rotated = rotatedOffset(
    xKm - Number(edit.xKm || 0),
    zKm - Number(edit.zKm || 0),
    edit.rotationYRad,
  );
  const radiusKm = Math.max(Math.abs(rotated.xKm), Math.abs(rotated.zKm));
  const outerKm = baseKm / 2;
  const innerKm = Math.min(topKm / 2, Math.max(0, outerKm - 1e-9));
  if (radiusKm >= outerKm) return 0;

  let fraction = 1;
  if (radiusKm > innerKm) {
    fraction = 1 - (radiusKm - innerKm) / Math.max(1e-9, outerKm - innerKm);
  }
  const sign = edit.kind === 'valley' ? -1 : edit.kind === 'mountain' ? 1 : 0;
  return sign * heightKm * 1000 * Math.max(0, Math.min(1, fraction));
}

export function applyScenarioEdits(sourceValues, meta, edits) {
  if (!meta?.site || !Number.isFinite(meta.latFloor) || !Number.isFinite(meta.lonFloor)) {
    throw new Error('Scenario DEM metadata requires site, latFloor and lonFloor.');
  }
  if (sourceValues.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
    throw new Error(`Expected ${SAMPLE_SIZE * SAMPLE_SIZE} source DEM cells, got ${sourceValues.length}`);
  }

  const source = Float64Array.from(sourceValues, finiteScenarioElevation);
  const scenario = Float64Array.from(source);
  const deltaM = new Float64Array(source.length);
  const safeEdits = Array.isArray(edits) ? edits : [];
  let changedCellCount = 0;
  let maxAbsDeltaM = 0;

  for (let index = 0; index < source.length; index += 1) {
    const point = indexToLatLon(index, meta);
    const local = latLonToLocalKm(meta.site, point.lat, point.lon);
    let delta = 0;
    for (const edit of safeEdits) delta += trapezoidDeltaMAt(local.xKm, local.zKm, edit);
    deltaM[index] = delta;
    scenario[index] = source[index] + delta;
    if (Math.abs(delta) > 1e-9) changedCellCount += 1;
    maxAbsDeltaM = Math.max(maxAbsDeltaM, Math.abs(delta));
  }

  const distances = cellDistances(meta.site.lat);
  const cellAreaM2 = distances.northSouth * distances.eastWest;
  let rasterizedCutM3 = 0;
  let rasterizedFillM3 = 0;
  for (const delta of deltaM) {
    if (delta < 0) rasterizedCutM3 += -delta * cellAreaM2;
    else rasterizedFillM3 += delta * cellAreaM2;
  }

  const designCutKm3 = safeEdits
    .filter((edit) => edit.kind === 'valley')
    .reduce((sum, edit) => sum + Number(edit.volumeKm3 || 0), 0);
  const designFillKm3 = safeEdits
    .filter((edit) => edit.kind === 'mountain')
    .reduce((sum, edit) => sum + Number(edit.volumeKm3 || 0), 0);

  return {
    source,
    scenario,
    deltaM,
    changedCellCount,
    changedCellFraction: changedCellCount / source.length,
    maxAbsDeltaM,
    cellAreaM2,
    rasterizedCutKm3: rasterizedCutM3 / 1e9,
    rasterizedFillKm3: rasterizedFillM3 / 1e9,
    designCutKm3,
    designFillKm3,
    designBankKm3: designCutKm3 - designFillKm3,
  };
}

export function buildScenarioFlowProducts(values, lat) {
  if (values.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
    throw new Error(`Expected ${SAMPLE_SIZE * SAMPLE_SIZE} scenario DEM cells, got ${values.length}`);
  }
  const elevations = Array.from(values, finiteScenarioElevation);
  const conditioning = conditionDemForDrainage(elevations);
  const routingElevations = conditioning.conditionedElevations;
  const receivers = computeD8Receivers(routingElevations, lat);
  const accumulation = computeFlowAccumulation(receivers);
  let dominantOutlet = 0;
  for (let index = 1; index < accumulation.length; index += 1) {
    if (accumulation[index] > accumulation[dominantOutlet]) dominantOutlet = index;
  }
  const watershed = delineateWatershed(receivers, dominantOutlet);
  return {
    elevations,
    routingElevations,
    receivers,
    accumulation,
    dominantOutlet,
    watershed,
    conditioning,
  };
}

function summarizeFlow(flow, meta) {
  const outlet = indexToLatLon(flow.dominantOutlet, meta);
  const pathIndices = tracePrincipalPath(
    flow.receivers,
    flow.accumulation,
    flow.watershed.mask,
    flow.dominantOutlet,
  );
  const path = pathIndices.map((index) => indexToLatLon(index, meta));
  return {
    dominantOutletIndex: flow.dominantOutlet,
    dominantOutlet: outlet,
    maxAccumulationCells: flow.accumulation[flow.dominantOutlet],
    dominantWatershedFraction: flow.watershed.size / flow.accumulation.length,
    conditionedFraction: flow.conditioning.filledFraction,
    meanFillDepthM: flow.conditioning.meanFillDepthM,
    maxFillDepthM: flow.conditioning.maxFillDepthM,
    principalPathKm: pathLengthKm(path),
    principalPath: path,
  };
}

export function compareBeforeAfter(sourceValues, scenarioValues, meta) {
  const beforeFlow = buildScenarioFlowProducts(sourceValues, meta.site.lat);
  const afterFlow = buildScenarioFlowProducts(scenarioValues, meta.site.lat);
  const before = summarizeFlow(beforeFlow, meta);
  const after = summarizeFlow(afterFlow, meta);

  let changedReceivers = 0;
  for (let index = 0; index < beforeFlow.receivers.length; index += 1) {
    if (beforeFlow.receivers[index] !== afterFlow.receivers[index]) changedReceivers += 1;
  }
  const pathComparison = compareDrainagePaths(before.principalPath, after.principalPath, 5);

  return {
    before,
    after,
    delta: {
      receiverChangedCells: changedReceivers,
      receiverChangedFraction: changedReceivers / beforeFlow.receivers.length,
      watershedFractionDelta: after.dominantWatershedFraction - before.dominantWatershedFraction,
      maxAccumulationDeltaCells: after.maxAccumulationCells - before.maxAccumulationCells,
      outletDistanceKm: pathComparison.outletDistanceKm,
      pathMeanNearestKm: pathComparison.meanNearestKm,
      pathConcordantFraction5km: pathComparison.concordantFraction,
    },
  };
}

export function buildScenarioComparisonRecord(state, sourceValues, meta) {
  const sourceSnapshot = Float64Array.from(sourceValues, finiteScenarioElevation);
  const applied = applyScenarioEdits(sourceValues, meta, state?.edits || []);
  const flow = compareBeforeAfter(applied.source, applied.scenario, meta);
  let sourceDemMutated = false;
  for (let index = 0; index < sourceSnapshot.length; index += 1) {
    if (sourceSnapshot[index] !== Number(sourceValues[index])) {
      sourceDemMutated = true;
      break;
    }
  }

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    interpretationStatus: 'hypothetical-terrain-scenario-not-real-world-modification',
    sourceDemMutated,
    site: { ...meta.site },
    sourceDem: {
      provider: 'Copernicus DEM public COG',
      tileUrl: meta.tileUrl || null,
      sampleSize: SAMPLE_SIZE,
      latFloor: meta.latFloor,
      lonFloor: meta.lonFloor,
    },
    edits: state?.edits || [],
    materialBalance: state?.materialBalance || null,
    rasterization: {
      changedCellCount: applied.changedCellCount,
      changedCellFraction: applied.changedCellFraction,
      maxAbsDeltaM: applied.maxAbsDeltaM,
      rasterizedCutKm3: applied.rasterizedCutKm3,
      rasterizedFillKm3: applied.rasterizedFillKm3,
      designCutKm3: applied.designCutKm3,
      designFillKm3: applied.designFillKm3,
      designBankKm3: applied.designBankKm3,
    },
    hydrology: flow,
    caution: 'D8 and Priority-Flood compare a hypothetical DEM delta against the immutable source DEM. This is a numerical experiment, not a forecast, engineering design or evidence that the terrain should be altered.',
  };
}
