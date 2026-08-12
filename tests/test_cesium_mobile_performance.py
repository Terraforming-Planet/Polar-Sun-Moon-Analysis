from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "web" / "src" / "CleanRealisticEarthGlobe.tsx"


def test_cesium_uses_adaptive_mobile_rendering_limits() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "window.matchMedia?.('(pointer: coarse)').matches" in source
    assert "viewer.resolutionScale = constrainedDevice ? .72 : 1" in source
    assert "maximumScreenSpaceError = constrainedDevice ? 1.5 : .55" in source
    assert "tileCacheSize = constrainedDevice ? 250 : 900" in source
    assert "minimumZoomDistance = constrainedDevice ? 25 : 1" in source
    assert "markers.slice(0, constrainedDevice ? 250 : 500)" in source


def test_mobile_full_live_view_reduces_expensive_overlays() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "constrainedDevice && layer === 'full-live-earth'" in source
    assert "layer === 'ocean-waves' || (layer === 'full-live-earth' && !constrainedDevice)" in source
    assert "viewer.scene.highDynamicRange = !constrainedDevice" in source
    assert "viewer.scene.postProcessStages.fxaa.enabled = !constrainedDevice" in source
