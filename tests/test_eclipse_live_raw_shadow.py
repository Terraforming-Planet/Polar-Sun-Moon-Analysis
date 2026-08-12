from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "eclipse-live" / "index.html"


def test_eclipse_live_uses_raw_visible_satellite_evidence() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "GOES19/ABI/FD/02/1808x1808.jpg" in source
    assert "Band 2 · 0,64 µm RAW VIS" in source
    assert "mtg_fd:vis06_hrfi" in source
    assert "mtg_fd:rgb_geocolour" in source
    assert "To są piksele satelitarne, nie render Cesium" in source


def test_eclipse_live_separates_terminator_from_lunar_shadow() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "viewer.scene.globe.enableLighting=false" in source
    assert "Dzień/noc Cesium OFF" in source
    assert "PENUMBRA · NASA BESSEL l1 · MODEL" in source
    assert "UMBRA · NASA GSFC" in source
    assert "0.537954" in source
    assert "71.4/3600" in source
    assert "penumbraRadiusKm" in source


def test_eclipse_live_can_follow_shadow_from_orbit() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Śledź cień · 700 km" in source
    assert "700000" in source
    assert "53.61586" in source
    assert "18.99546" in source
