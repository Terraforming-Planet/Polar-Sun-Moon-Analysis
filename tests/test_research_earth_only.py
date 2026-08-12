from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "web" / "public" / "research" / "research-model.js"
NOTEBOOK = ROOT / "notebooks" / "cdse_realistic_earth_pipeline.ipynb"


def test_research_uses_notebook_nasa_gibs_earth_pipeline() -> None:
    source = MODEL.read_text(encoding="utf-8")
    notebook = NOTEBOOK.read_text(encoding="utf-8")

    assert "VIIRS_SNPP_CorrectedReflectance_TrueColor" in source
    assert "satellite-manifest.json" in source
    assert "VIIRS_SNPP_CorrectedReflectance_TrueColor" in notebook
    assert "solar-system.json" not in source
    assert "buildSunEarthMoon" not in source


def test_research_keeps_exact_512_cell_grid() -> None:
    source = MODEL.read_text(encoding="utf-8")

    assert "z * 64 + y * 8 + x" in source
    assert "cells.length !== 512" in source
