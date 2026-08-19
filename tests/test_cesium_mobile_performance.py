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
    assert "viewer.resolutionScale = constrainedDevice ? 0.72 : 1" in source
    assert "maximumScreenSpaceError = constrainedDevice ? 1.5 : 0.5" in source
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
    for mode in ("full-live-earth", "global-clouds", "regional-clouds", "nasa-day"):
        assert f"layer === '{mode}'" in source
    for mode in ("regional-clouds", "ocean-waves", "goes-east", "goes-west"):
        assert f"layer === '{mode}'" in source

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


def test_every_globe_layer_uses_same_utc_day_night_terminator() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert (
        "viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(date.toISOString())"
        in source
    )
    assert "viewer.scene.globe.enableLighting = solarLighting" in source
    assert "real-time Sun lighting" in source
    assert "disabled={cloudCoverageMode}" not in source
    assert "solarLighting && !cloudCoverageMode" not in source


def test_public_live_adapters_are_available_in_the_globe_selector() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    expected = (
        "NASA Terra MODIS",
        "NOAA GOES-East",
        "NOAA GOES-West",
        "Copernicus Sentinel — true colour",
        "Copernicus Sentinel — NDVI",
        "EUMETSAT EUMETView",
    )
    for label in expected:
        assert label in source
    assert "VITE_EUMETVIEW_LAYER" in source
    assert "VITE_CDSE_TRUE_COLOR_LAYER" in source
    assert "VITE_CDSE_NDVI_LAYER" in source


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
