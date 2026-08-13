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


def test_hydrology_module_uses_requested_scales_and_candidate_wording() -> None:
    source = HYDRO.read_text(encoding="utf-8")

    assert "overpass-api.de/api/interpreter" in source
    assert "around:100000" in source
    assert "around:15000" in source
    assert "KANDYDAT POŁĄCZENIA DO INSPEKCJI" in source
    assert "nie potwierdzone uszkodzenie" in source
    assert "nie dowodzi bezpośredniego połączenia" in source


def test_hydrology_100km_is_resilient_and_blue_led() -> None:
    source = HYDRO.read_text(encoding="utf-8")

    assert "overpass.kumi.systems/api/interpreter" in source
    assert "overpass.private.coffee/api/interpreter" in source
    assert "regionalCells" in source
    assert "PolylineGlowMaterialProperty" in source
    assert "#24d6ff" in source
    assert "#1687ff" in source
    assert "GUGIK_HYDRO_WMS" in source


def test_latest_satellite_view_uses_nasa_gibs_and_cdse_stac() -> None:
    source = HYDRO.read_text(encoding="utf-8")

    assert "gibs.earthdata.nasa.gov" in source
    assert "VIIRS_NOAA21_CorrectedReflectance_TrueColor" in source
    assert "stac.dataspace.copernicus.eu/v1/search" in source
    assert "sentinel-2-l2a" in source
    assert "Najnowszy satelita · NASA + CDSE" in source
