from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "water-local" / "index.html"
HYDRO = ROOT / "web" / "public" / "water-local" / "hydrology-100km.js"


def test_water_page_wires_100km_hydrology_module() -> None:
    page = PAGE.read_text(encoding="utf-8")
    assert 'id="hydrology-100km"' in page
    assert 'id="hydrology-summary"' in page
    assert 'src="hydrology-100km.js"' in page


def test_reference_mosaic_is_not_an_active_map_mode() -> None:
    page = PAGE.read_text(encoding="utf-8")
    assert 'id="satellite-reference"' in page
    assert 'id="satellite-reference" disabled' in page
    assert "addSatelliteReference(1)" not in page
    assert "SATELLITE_REFERENCE" not in page


def test_hydrology_module_uses_progressive_local_and_regional_scales() -> None:
    source = HYDRO.read_text(encoding="utf-8")
    assert "overpass-api.de/api/interpreter" in source
    assert "around:100000" in source
    assert "around:25000" in source
    assert "namedIndexQuery" in source
    assert "localGeometryQuery" in source
    assert "regionalNamedQuery" in source
    assert "KANDYDAT POŁĄCZENIA DO INSPEKCJI" in source
    assert "nie potwierdzone uszkodzenie" in source
    assert "nie dowodzi bezpośredniego połączenia" in source


def test_hydrology_100km_is_resilient_blue_led_and_has_official_context() -> None:
    source = HYDRO.read_text(encoding="utf-8")
    assert "overpass.kumi.systems/api/interpreter" in source
    assert "overpass.private.coffee/api/interpreter" in source
    assert "PolylineGlowMaterialProperty" in source
    assert "#24d6ff" in source
    assert "#1687ff" in source
    assert "GUGIK_HYDRO_WMS" in source
    assert "addHydroGeoportalFallback()" in source
    assert "GARDEJA_OFFICIAL_LAKES" in source
    assert "Kucki" in source
    assert "Klasztorne" in source
    assert "Kamień" in source
    assert "Gardęga" in source
    assert "Wandówka" in source
    assert "Cyganówka" in source
    assert "distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,260000)" in source


def test_latest_satellite_prefers_cdse_sentinel2_and_keeps_nasa_fallback() -> None:
    source = HYDRO.read_text(encoding="utf-8")
    assert "stac.dataspace.copernicus.eu/v1/search" in source
    assert "sentinel-2-l2a" in source
    assert "CDSE_WMS" in source
    assert "NATURAL-COLOR" in source
    assert "gibs.earthdata.nasa.gov" in source
    assert "VIIRS_NOAA21_CorrectedReflectance_TrueColor" in source
    assert "Sentinel-2 · najnowszy + NASA fallback" in source


def test_hydrology_load_is_non_blocking_and_progressive() -> None:
    source = HYDRO.read_text(encoding="utf-8")
    assert "button.disabled=false" in source
    assert "ładowanie progresywne" in source
    assert "Promise.all([worker(),worker()])" in source
    assert "setTimeout(()=>loadHydrology100km(),1200)" in source
