import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"
DATA = ROOT / "data" / "training" / "paleoriver_8"


def test_lab_wrapper_preserves_and_delegates_existing_runtime() -> None:
    web_wrapper = (WEB / "sahara-lab.js").read_text(encoding="utf-8")
    docs_wrapper = (DOCS / "sahara-lab.js").read_text(encoding="utf-8")
    web_legacy = (WEB / "sahara-lab-legacy.js").read_text(encoding="utf-8")
    docs_legacy = (DOCS / "sahara-lab-legacy.js").read_text(encoding="utf-8")

    assert web_wrapper == docs_wrapper
    assert web_legacy == docs_legacy
    assert "await import('./sahara-lab-legacy.js')" in web_wrapper
    assert "await import('./sahara-scenario-hydrology.js')" in web_wrapper
    assert "window.__getSaharaScenarioState" in web_wrapper
    assert "object.position.x" in web_wrapper
    assert "rotationYRad" in web_wrapper

    for marker in (
        "const BOARD_SIZE = 8",
        "renderer.shadowMap.enabled = true",
        "function createMountain",
        "function createValley",
        "function loadCopernicusDem",
        "function updateShapeLimits()",
    ):
        assert marker in web_legacy


def test_scenario_modules_are_published_identically() -> None:
    for filename in ("sahara-scenario-core.js", "sahara-scenario-hydrology.js"):
        assert (WEB / filename).read_text(encoding="utf-8") == (
            DOCS / filename
        ).read_text(encoding="utf-8")

    core = (WEB / "sahara-scenario-core.js").read_text(encoding="utf-8")
    runtime = (WEB / "sahara-scenario-hydrology.js").read_text(encoding="utf-8")
    assert "applyScenarioEdits" in core
    assert "buildScenarioComparisonRecord" in core
    assert "sourceDemMutated" in core
    assert "Policz PRZED vs PO" in runtime
    assert "Copernicus DEM pozostaje obserwacją źródłową" in runtime
    assert "sahara_scenario_dem_before_after.json" in runtime


def test_scenario_core_keeps_source_dem_immutable_and_changes_routing() -> None:
    script = r"""
import { buildScenarioComparisonRecord } from './web/public/sahara-station/sahara-scenario-core.js';
const size = 33;
const source = new Float64Array(size * size);
for (let row = 0; row < size; row += 1) {
  for (let col = 0; col < size; col += 1) {
    source[row * size + col] = 1200 - row * 3 - col * 1.2;
  }
}
const original = Array.from(source);
const state = {
  site: { lat: 23.515002, lon: 11.998501 },
  edits: [
    {
      id: 1,
      kind: 'valley',
      xKm: 9,
      zKm: -4,
      rotationYRad: 0,
      shape: { base: 20, top: 2, height: 1.5 },
      volumeKm3: 221,
    },
    {
      id: 2,
      kind: 'mountain',
      xKm: -12,
      zKm: 8,
      rotationYRad: Math.PI / 4,
      shape: { base: 20, top: 2, height: 1.5 },
      volumeKm3: 221,
    },
  ],
  materialBalance: { excavatedKm3: 221, filledKm3: 221, bankKm3: 0 },
};
const record = buildScenarioComparisonRecord(state, source, {
  site: state.site,
  latFloor: 23,
  lonFloor: 11,
  tileUrl: 'synthetic://copernicus-dem-test',
});
const unchanged = original.every((value, index) => value === source[index]);
const checks = [
  unchanged,
  record.sourceDemMutated === false,
  record.rasterization.changedCellCount > 0,
  record.rasterization.maxAbsDeltaM > 500,
  Math.abs(record.rasterization.designBankKm3) < 1e-9,
  record.hydrology.delta.receiverChangedFraction > 0,
  Number.isFinite(record.hydrology.delta.outletDistanceKm),
  record.hydrology.before.principalPath.length > 1,
  record.hydrology.after.principalPath.length > 1,
];
if (checks.some((value) => !value)) {
  console.error(JSON.stringify({
    unchanged,
    sourceDemMutated: record.sourceDemMutated,
    rasterization: record.rasterization,
    delta: record.hydrology.delta,
    beforePath: record.hydrology.before.principalPath.length,
    afterPath: record.hydrology.after.principalPath.length,
  }));
  process.exit(1);
}
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", script],
        check=True,
        capture_output=True,
        text=True,
    )


def test_iteration_13_note_separates_observation_scenario_and_inference() -> None:
    note = (DATA / "research_note_iteration_13.md").read_text(encoding="utf-8")

    assert "Observation layer" in note
    assert "Scenario layer" in note
    assert "sourceDemMutated" in note
    assert "must remain `false`" in note
    assert "not a prediction of rainfall" in note
    assert "Design volume" in note
    assert "Rasterized diagnostic volume" in note
