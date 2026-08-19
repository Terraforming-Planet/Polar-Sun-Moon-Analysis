from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "web" / "src" / "RealisticEarthGlobe.tsx"


def test_public_earth_viewer_uses_only_scientific_cesium_renderer() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "CesiumScientificEarth" in source
    assert "EarthViewerErrorBoundary" in source
    assert "StableEarthGlobe" not in source
    assert "readEarthModel" not in source
    assert "writeEarthModel" not in source
    assert "Legacy sphere" not in source
    assert "Lekki WGS84" not in source
    assert "public scientific Earth renderer" in source


def test_failed_cesium_does_not_show_synthetic_globe() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert (
        "We do not replace the scientific viewer with an artificial fallback sphere "
        "or fabricated texture"
    ) in source
    assert "ScientificViewerFailure" in source
