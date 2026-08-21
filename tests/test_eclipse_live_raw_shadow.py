from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
CLOSE = ROOT / "web" / "public" / "eclipse-live" / "close.html"
REPLAY = ROOT / "web" / "public" / "eclipse-live" / "replay-2026.html"
ARCHIVE = ROOT / "web" / "public" / "eclipse" / "2026-08-12" / "archive.json"


def test_eclipse_observatory_keeps_raw_visible_satellite_evidence() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "GOES19/ABI/FD/02/1808x1808.jpg" in source
    assert "mtg_fd:vis06_hrfi" in source
    assert "NOAA GOES-19" in source
    assert "EUMETSAT Meteosat-12" in source
    assert "Cesium = wizualizacja" in source


def test_historical_2026_besselian_model_is_frozen_to_archived_frame_time() -> None:
    source = REPLAY.read_text(encoding="utf-8")

    assert "deltaT:75.4" in source
    assert "tanF1:0.0046141" in source
    assert "tanF2:0.0045911" in source
    assert "NASA GSFC BESSELIAN · MODEL · NIE FOTOGRAFIA" in source
    assert "new Date(frame.observed_utc)" in source
    assert "Model lokalnej fazy jest obliczany dla dokładnego czasu wybranej klatki" in source
    assert "setInterval" not in source


def test_legacy_close_url_redirects_to_historical_replay() -> None:
    source = CLOSE.read_text(encoding="utf-8")

    assert 'content="0;url=./replay-2026.html"' in source
    assert "location.replace('./replay-2026.html')" in source
    assert "Stary tryb LIVE nie jest już uruchamiany z bieżącą datą" in source
    assert "new Date()" not in source


def test_closed_2026_archive_declares_raw_observation_provenance() -> None:
    source = ARCHIVE.read_text(encoding="utf-8")

    assert '"status": "closed-historical-archive"' in source
    assert '"frame_count": 5' in source
    assert '"satellite_observation": true' in source
    assert '"synthetic": false' in source
    assert '"model_overlay": false' in source
    assert '"primary_manifest": "./goes19-band02/manifest.json"' in source
    assert '"historical_replay": "../../eclipse-live/replay-2026.html"' in source


def test_future_3d_view_links_to_official_nasa_path_instead_of_drawing_fake_limits() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "NASA · dokładna mapa pasa" in source
    assert "Dokładne północne/południowe granice i linię centralną" in source
    assert "activeEvent.official_path_map" in source
    assert "PUNKT TESTOWY" in source
    assert "ellipse:{" not in source
