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
    assert "viewer.resolutionScale = constrainedDevice ? 1 : 1.2" in source
    assert "maximumScreenSpaceError = constrainedDevice ? 0.9 : 0.5" in source
    assert "tileCacheSize = constrainedDevice ? 450 : 900" in source
    assert "minimumZoomDistance = constrainedDevice ? 25 : 5" in source
    assert "constrainedDevice ? 13_500_000 : 16_500_000" in source
    assert "const markerLimit = constrainedDevice ? 250 : 500" in source
    assert "markers.slice(0, markerLimit)" in source


def test_full_live_uses_complete_base_and_dated_viirs_overlay() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "const NASA_BLUE_MARBLE = 'BlueMarble_ShadedRelief_Bathymetry'" in source
    assert (
        "const NASA_GLOBAL_TRUE_COLOR = "
        "'VIIRS_SNPP_CorrectedReflectance_TrueColor'"
    ) in source
    assert "layer: NASA_BLUE_MARBLE" in source
    assert "tileMatrixSetID: 'GoogleMapsCompatible_Level8'" in source
    assert "const usesDatedViirs =" in source
    assert "layer === 'nasa-day'" in source
    assert "layer === 'global-clouds'" in source
    assert "(!constrainedDevice && layer === 'full-live-earth')" in source
    assert "dimensions: { Time: completeDay }" in source
    assert "REGIONAL_CLOUD_PRODUCTS" in source
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


def test_mobile_full_live_prioritizes_complete_base_and_reduces_overlays() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    wave_condition = (
        "layer === 'ocean-waves' || "
        "(!constrainedDevice && layer === 'full-live-earth')"
    )

    assert wave_condition in source
    assert "REGIONAL_CLOUD_PRODUCTS.slice(0, 1)" in source
    assert "viewer.scene.highDynamicRange = !constrainedDevice" in source
    assert "viewer.scene.fog.enabled = false" in source
    assert "(!constrainedDevice && layer === 'full-live-earth')" in source


def test_playback_controls_stay_above_cesium_canvas() -> None:
    css = CSS.read_text(encoding="utf-8")

    assert ".tiled-earth-playback{position:absolute;z-index:24" in css
    assert ".tiled-earth-canvas{position:absolute" in css
