from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
CLOSE = ROOT / "web" / "public" / "eclipse-live" / "close.html"
ARCHIVE = ROOT / "web" / "public" / "eclipse" / "2026-08-12" / "archive.json"


def test_eclipse_observatory_keeps_raw_visible_satellite_evidence() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "GOES19/ABI/FD/02/1808x1808.jpg" in source
    assert "mtg_fd:vis06_hrfi" in source
    assert "NOAA GOES-19" in source
    assert "EUMETSAT Meteosat-12" in source
    assert "Cesium = wizualizacja" in source


def test_historical_2026_besselian_model_is_preserved_in_close_view() -> None:
    source = CLOSE.read_text(encoding="utf-8")

    assert "viewer.scene.sun.show=false" in source
    assert "viewer.scene.moon.show=false" in source
    assert "deltaT:75.4" in source
    assert "tanF1:0.0046141" in source
    assert "tanF2:0.0045911" in source
    assert "MODEL NASA GSFC · lokalna faza · NIE FOTOGRAFIA" in source


def test_closed_2026_archive_declares_raw_observation_provenance() -> None:
    source = ARCHIVE.read_text(encoding="utf-8")

    assert '"status": "closed-historical-archive"' in source
    assert '"frame_count": 5' in source
    assert '"satellite_observation": true' in source
    assert '"synthetic": false' in source
    assert '"model_overlay": false' in source
    assert '"primary_manifest": "./goes19-band02/manifest.json"' in source


def test_future_3d_view_links_to_official_nasa_path_instead_of_drawing_fake_limits() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "NASA · dokładna mapa pasa" in source
    assert "Dokładne północne/południowe granice i linię centralną" in source
    assert "activeEvent.official_path_map" in source
    assert "PUNKT TESTOWY" in source
    assert "ellipse:{" not in source
