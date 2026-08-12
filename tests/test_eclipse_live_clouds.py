from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "eclipse-live" / "index.html"


def test_eclipse_live_uses_real_visible_satellite_sources() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "mtg_fd:vis06_hrfi" in source
    assert "mtg_fd:rgb_geocolour" not in source
    assert "view.eumetsat.int/geoserver/wms" in source
    assert "Meteosat-12 · Europa · VIS 0.6 HRFI" in source
    assert "NOAA GOES-19 · Band 2 · 0.64 µm RAW VIS" in source
    assert "Zdjęcie satelitarne = obserwacja" in source


def test_eclipse_live_has_olszowka_and_camera_presets() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Olszówka · gmina Gardeja" in source
    assert "53.61586" in source
    assert "18.99546" in source
    assert "fly(5000,-35)" in source
    assert "fly(2500000,-90,0)" in source
    assert "fly(10000000,-90,0)" in source
    assert "humanView" in source


def test_eclipse_live_computes_local_circumstances_from_nasa() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "deltaT:75.4" in source
    assert "0.4755140" in source
    assert "0.7711830" in source
    assert "0.5379550" in source
    assert "-0.0081420" in source
    assert "localState" in source
    assert "circleOverlap" in source
    assert "Zakrycie tarczy Słońca" in source
    assert "Wysokość Słońca" in source
    assert "Azymut Słońca" in source
