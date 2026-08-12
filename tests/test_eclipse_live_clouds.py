from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "eclipse-live" / "index.html"


def test_eclipse_live_uses_real_cloud_and_satellite_sources() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "mtg_fd:rgb_geocolour" in source
    assert "view.eumetsat.int/geoserver/wms" in source
    assert "EUMETSAT EUMETView" in source
    assert "NOAA GOES-19" in source
    assert "SATELLITE_PHOTOGRAPHY = TRUE · SYNTHETIC = FALSE" in source


def test_eclipse_live_has_olszowka_and_camera_presets() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Olszówka · gmina Gardeja" in source
    assert "53.61586" in source
    assert "18.99546" in source
    assert "fly(2,4)" in source
    assert "fly(5000,-35)" in source
    assert "fly(2500000,-90,0)" in source
    assert "fly(10000000,-90,0)" in source


def test_eclipse_live_separates_nasa_model_from_observation() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "nasaUmbraPath" in source
    assert "UMBRA · NASA GSFC MODEL" in source
    assert "model centralnej umbry" in source
    assert "nie fotografia" in source
    assert "setInterval(poll,5000)" in source
