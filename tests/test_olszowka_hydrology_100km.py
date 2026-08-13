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
    assert "uszkodzony dopływ/odpływ" in source
