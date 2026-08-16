import subprocess


FLOW_CORE = "web/public/sahara-station/sahara-flow-core.js"
DOCS_FLOW_CORE = "docs/sahara-station/sahara-flow-core.js"
HYDROLOGY = "web/public/sahara-station/sahara-hydrology.js"
DOCS_HYDROLOGY = "docs/sahara-station/sahara-hydrology.js"
NOTE = "data/training/paleoriver_8/research_note_iteration_6.md"


def test_priority_flood_preserves_raw_dem_and_routes_interior() -> None:
    script = """
import { buildFlowProducts } from './web/public/sahara-station/sahara-flow-core.js';
const size = 33;
const values = new Float64Array(size * size).fill(100);
values[16 * size + 16] = 90;
const result = buildFlowProducts(values, 25);
const checks = [
  result.elevations[16 * size + 16] === 90,
  result.routingElevations[16 * size + 16] > 100,
  result.conditioning.filledCellCount > 0,
  result.conditioning.maxFillDepthM > 10,
  result.conditioning.interiorSinkCountAfter === 0,
  result.accumulation[result.dominantOutlet] > 1,
];
if (checks.some((value) => !value)) {
  console.error(JSON.stringify({
    rawCenter: result.elevations[16 * size + 16],
    routingCenter: result.routingElevations[16 * size + 16],
    conditioning: result.conditioning,
    maxAccumulation: result.accumulation[result.dominantOutlet],
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


def test_iteration_six_keeps_web_and_docs_modules_identical() -> None:
    with open(FLOW_CORE, encoding="utf-8") as handle:
        flow = handle.read()
    with open(DOCS_FLOW_CORE, encoding="utf-8") as handle:
        docs_flow = handle.read()
    with open(HYDROLOGY, encoding="utf-8") as handle:
        hydrology = handle.read()
    with open(DOCS_HYDROLOGY, encoding="utf-8") as handle:
        docs_hydrology = handle.read()
    with open(NOTE, encoding="utf-8") as handle:
        note = handle.read()

    assert "conditionDemForDrainage" in flow
    assert "FLAT_EPSILON_M = 0.001" in flow
    assert "Priority-Flood" in hydrology
    assert "conditionedInteriorSinkCount" in hydrology
    assert flow == docs_flow
    assert hydrology == docs_hydrology
    assert "nie jest objętością zbiornika" in note
