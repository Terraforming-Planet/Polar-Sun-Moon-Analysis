import json
import pathlib
import subprocess


ROOT = pathlib.Path(__file__).resolve().parents[1]
FLOW_CORE = ROOT / "web" / "public" / "sahara-station" / "sahara-flow-core.js"
DOCS_FLOW_CORE = ROOT / "docs" / "sahara-station" / "sahara-flow-core.js"
HYDROLOGY = ROOT / "web" / "public" / "sahara-station" / "sahara-hydrology.js"
DOCS_HYDROLOGY = ROOT / "docs" / "sahara-station" / "sahara-hydrology.js"
NOTE = ROOT / "data" / "training" / "paleoriver_8" / "research_note_iteration_6.md"


def run_node_conditioning_case() -> dict[str, float | int]:
    module_uri = FLOW_CORE.resolve().as_uri()
    script = f"""
import {{ buildFlowProducts }} from {json.dumps(module_uri)};
const size = 33;
const values = new Float64Array(size * size).fill(100);
values[16 * size + 16] = 90;
const result = buildFlowProducts(values, 25);
console.log(JSON.stringify({{
  rawCenter: result.elevations[16 * size + 16],
  routingCenter: result.routingElevations[16 * size + 16],
  filledCellCount: result.conditioning.filledCellCount,
  maxFillDepthM: result.conditioning.maxFillDepthM,
  interiorSinkCountAfter: result.conditioning.interiorSinkCountAfter,
  maxAccumulation: result.accumulation[result.dominantOutlet],
}}));
"""
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_priority_flood_preserves_raw_dem_and_routes_interior() -> None:
    result = run_node_conditioning_case()

    assert result["rawCenter"] == 90
    assert result["routingCenter"] > 100
    assert result["filledCellCount"] > 0
    assert result["maxFillDepthM"] > 10
    assert result["interiorSinkCountAfter"] == 0
    assert result["maxAccumulation"] > 1


def test_iteration_six_keeps_web_and_docs_modules_identical() -> None:
    flow = FLOW_CORE.read_text(encoding="utf-8")
    hydrology = HYDROLOGY.read_text(encoding="utf-8")

    assert "conditionDemForDrainage" in flow
    assert "FLAT_EPSILON_M = 0.001" in flow
    assert "Priority-Flood" in hydrology
    assert "conditionedInteriorSinkCount" in hydrology
    assert flow == DOCS_FLOW_CORE.read_text(encoding="utf-8")
    assert hydrology == DOCS_HYDROLOGY.read_text(encoding="utf-8")
    assert NOTE.exists()
