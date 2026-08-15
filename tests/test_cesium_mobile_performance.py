from pathlib import Path

SOURCE = (
    Path(__file__).resolve().parents[1]
    / "web"
    / "src"
    / "CleanRealisticEarthGlobe.tsx"
)
CSS = Path(__file__).resolve().parents[1] / "web" / "src" / "tiled-earth.css"


def test_cesium_uses_adaptive_mobile_rendering_limits() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "typeof window === 'undefined'" in source
    assert "window.matchMedia?.('(pointer: coarse)').matches" in source
    assert "viewer.resolutionScale = constrainedDevice ? .72 : 1" in source
    assert "maximumScreenSpaceError = constrainedDevice ? 1.5 : .5" in source
    assert "tileCacheSize = constrainedDevice ? 250 : 900" in source
    assert "minimumZoomDistance = constrainedDevice ? 25 : 5" in source
    assert "const markerLimit = constrainedDevice ? 250 : 500" in source
    assert "markers.slice(0, markerLimit)" in source


def test_full_live_uses_one_global_viirs_cloud_bearing_layer() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert (
        "const NASA_GLOBAL_TRUE_COLOR = "
        "'VIIRS_SNPP_CorrectedReflectance_TrueColor'"
    ) in source
    global_modes = (
        "layer === 'full-live-earth' || layer === 'global-clouds' || "
        "layer === 'regional-clouds' || layer === 'nasa-day'"
    )
    assert global_modes in source
    assert (
        "animatedMode = layer === 'regional-clouds' || layer === 'ocean-waves'"
        in source
    )

    composition_start = source.index("const usesGlobalTrueColor =")
    regional_start = source.index(
        "if (layer === 'regional-clouds') {", composition_start
    )
    waves_start = source.index("if (layer === 'ocean-waves'", regional_start)
    global_composition = source[composition_start:regional_start]
    regional_block = source[regional_start:waves_start]

    assert "GOES-East_ABI_GeoColor" not in global_composition
    assert "REGIONAL_CLOUD_PRODUCTS" in regional_block
    assert "GOES-East_ABI_GeoColor" in source
    assert "GOES-West_ABI_GeoColor" in source
    assert "Himawari_AHI_Band13_Clean_Infrared" in source


def test_cloud_modes_do_not_hide_clouds_behind_cesium_terminator() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    cloud_modes = (
        "layer === 'full-live-earth' || layer === 'global-clouds' || "
        "layer === 'regional-clouds'"
    )
    assert f"const cloudCoverageMode = {cloud_modes}" in source
    assert (
        "viewer.scene.globe.enableLighting = solarLighting && !cloudCoverageMode"
        in source
    )
    assert "disabled={cloudCoverageMode}" in source
    assert "bez odcięcia chmur" in source


def test_mobile_full_live_reduces_expensive_overlays() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    wave_condition = (
        "layer === 'ocean-waves' || "
        "(!constrainedDevice && layer === 'full-live-earth')"
    )

    assert wave_condition in source
    assert "REGIONAL_CLOUD_PRODUCTS.slice(0, 1)" in source
    assert "viewer.scene.highDynamicRange = !constrainedDevice" in source
    assert "viewer.scene.postProcessStages.fxaa.enabled = !constrainedDevice" in source


def test_playback_controls_stay_above_cesium_canvas() -> None:
    css = CSS.read_text(encoding="utf-8")

    assert ".tiled-earth-playback{position:absolute;z-index:24" in css
    assert ".tiled-earth-canvas{position:absolute" in css
