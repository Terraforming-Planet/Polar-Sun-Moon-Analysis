from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "eclipse-live" / "index.html"


def test_eclipse_live_uses_raw_visible_satellite_evidence() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "GOES19/ABI/FD/02/1808x1808.jpg" in source
    assert "mtg_fd:vis06_hrfi" in source
    assert "Meteosat-12 FCI VIS 0.6 HRFI" in source
    assert "nie render Cesium" in source


def test_eclipse_live_separates_cesium_from_lunar_geometry() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "viewer.scene.globe.enableLighting=false" in source
    assert "viewer.scene.sun.show=false" in source
    assert "viewer.scene.moon.show=false" in source
    assert "czarna „kropka” Cesium została usunięta" in source
    assert "PENUMBRA · NASA BESSEL · MODEL" in source
    assert "UMBRA · NASA GSFC · MODEL" in source
    assert "deltaT:75.4" in source
    assert "tanF1:0.0046141" in source
    assert "tanF2:0.0045911" in source


def test_eclipse_live_can_follow_shadow_from_orbit() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Śledź oś cienia · 700 km" in source
    assert "700000" in source
    assert "53.61586" in source
    assert "18.99546" in source
    assert "goes19-band02/manifest.json" in source
