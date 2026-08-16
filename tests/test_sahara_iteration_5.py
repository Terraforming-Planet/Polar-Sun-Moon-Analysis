from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"


def test_iteration_five_shares_flow_core_between_screening_and_relief() -> None:
    core = (WEB / "sahara-flow-core.js").read_text(encoding="utf-8")
    hydrology = (WEB / "sahara-hydrology.js").read_text(encoding="utf-8")
    relief = (WEB / "sahara-dem-relief.js").read_text(encoding="utf-8")

    assert "buildFlowProducts" in core
    assert "computeD8Receivers" in core
    assert "computeFlowAccumulation" in core
    assert "delineateWatershed" in core
    assert "from './sahara-flow-core.js'" in hydrology
    assert "from './sahara-flow-core.js'" in relief


def test_iteration_five_renders_concentrated_d8_flow_on_3d_relief() -> None:
    relief = (WEB / "sahara-dem-relief.js").read_text(encoding="utf-8")

    assert "buildFlowOverlay(sample)" in relief
    assert "d8-flow-accumulation-lines" in relief
    assert "d8-dominant-outlet" in relief
    assert "percentile(products.accumulation, 0.90)" in relief
    assert "new THREE.LineSegments" in relief


def test_iteration_five_exports_eight_case_hydrology_features() -> None:
    hydrology = (WEB / "sahara-hydrology.js").read_text(encoding="utf-8")

    assert "downloadHydrologyJson" in hydrology
    assert "downloadHydrologyCsv" in hydrology
    assert "paleoriver_hydrology_8.json" in hydrology
    assert "paleoriver_hydrology_8.csv" in hydrology
    assert "dominantWatershedFraction" in hydrology
    assert "flowAccumulationMaxCells" in hydrology


def test_iteration_five_web_docs_parity() -> None:
    for filename in (
        "sahara-flow-core.js",
        "sahara-hydrology.js",
        "sahara-dem-relief.js",
    ):
        assert (WEB / filename).read_text(encoding="utf-8") == (
            DOCS / filename
        ).read_text(encoding="utf-8")


def test_iteration_five_research_note_exists() -> None:
    note = ROOT / "data" / "training" / "paleoriver_8" / "research_note_iteration_5.md"
    text = note.read_text(encoding="utf-8")

    assert "wizualizacja 3D" in text
    assert "D8" in text
    assert "JSON/CSV" in text
    assert "nie jest dowodem" in text
