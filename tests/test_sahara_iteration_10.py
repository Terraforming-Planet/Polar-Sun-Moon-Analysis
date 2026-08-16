from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "sahara-station"
DOCS = ROOT / "docs" / "sahara-station"
DATA = ROOT / "data" / "training" / "paleoriver_8"


def test_unified_training_runtime_is_published_identically() -> None:
    web = (WEB / "sahara-training-records.js").read_text(encoding="utf-8")
    docs = (DOCS / "sahara-training-records.js").read_text(encoding="utf-8")

    assert web == docs
    assert "buildUnifiedTraining8" in web
    assert "paleoriver_unified_training_8.json" in web
    assert "paleoriver_unified_training_8.csv" in web


def test_unified_training_joins_all_four_hydrology_layers() -> None:
    runtime = (WEB / "sahara-training-records.js").read_text(encoding="utf-8")

    for marker in (
        "__paleoriverHydrology8",
        "__paleoriverMosaicHydrology8",
        "__paleoriverDrainageStability8",
        "__paleoriverPathConcordance8",
        "optical_mean_r",
        "dem_relief_m",
        "d8_max_accumulation_cells_1deg",
        "d8_max_accumulation_cells_3deg",
        "drainage_stability",
        "path_concordance",
    ):
        assert marker in runtime


def test_unified_training_keeps_screening_separate_from_ground_truth() -> None:
    runtime = (WEB / "sahara-training-records.js").read_text(encoding="utf-8")
    note = (DATA / "research_note_iteration_10.md").read_text(encoding="utf-8")
    schema = (DATA / "unified_schema_v1.json").read_text(encoding="utf-8")

    assert "screening-not-geological-proof" in runtime
    assert "screening-not-geological-proof" in schema
    assert "paleoriver=true/false" in note
    assert '"sar": "not-yet-included"' in schema


def test_unified_training_runtime_is_loaded_by_sahara_globe_graph() -> None:
    for root in (WEB, DOCS):
        overlay = (root / "sahara-drainage-path-overlay.js").read_text(encoding="utf-8")
        globe = (root / "sahara-globe.js").read_text(encoding="utf-8")

        assert "./sahara-training-records.js" in overlay
        assert "./sahara-drainage-path-overlay.js" in globe
