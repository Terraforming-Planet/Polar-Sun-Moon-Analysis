from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def test_required_public_views_and_data_files_exist() -> None:
    required = [
        WEB / "public" / "flood-map" / "index.html",
        WEB / "public" / "flood-map" / "assets" / "map-data.json",
        WEB / "public" / "research" / "index.html",
        WEB / "public" / "research" / "research-model.js",
        WEB / "public" / "data" / "hazards.json",
        WEB / "public" / "data" / "hydrology" / "glofas-catalog.json",
        ROOT / ".github" / "workflows" / "eclipse-2026-08-12.yml",
    ]

    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    assert not missing, f"Missing required public project files: {missing}"


def test_control_center_keeps_all_primary_tabs_and_project_paths() -> None:
    source = (WEB / "src" / "main.tsx").read_text(encoding="utf-8")

    for tab in (
        "control",
        "earth",
        "floods",
        "fires",
        "water",
        "north",
        "south",
        "solar",
        "sources",
    ):
        assert f"['{tab}'" in source or f",['{tab}'" in source

    assert "data/hazards.json" in source
    assert "data/copernicus/latest.json" in source
    assert "flood-map/assets/map-data.json" in source
    assert "<HydrologyPanel baseUrl={base}/>" in source


def test_cesium_remains_primary_scientific_renderer_with_fallback() -> None:
    source = (WEB / "src" / "RealisticEarthGlobe.tsx").read_text(encoding="utf-8")

    assert "CleanRealisticEarthGlobe" in source
    assert "const [satelliteMode, setSatelliteMode] = useState(true)" in source
    assert "<CesiumScientificEarth selectedTime={selectedTime} markers={markers} />" in source
    assert "StableEarthGlobe" in source


def test_research_grid_keeps_exact_8x8x8_addressing_and_cube_spacing() -> None:
    script = (WEB / "public" / "research" / "research-model.js").read_text(encoding="utf-8")

    assert "for (let z = 0; z < 8; z += 1)" in script
    assert "for (let y = 0; y < 8; y += 1)" in script
    assert "for (let x = 0; x < 8; x += 1)" in script
    assert "z * 64 + y * 8 + x" in script
    assert "cells.length !== 512" in script
    assert "72px" in script
