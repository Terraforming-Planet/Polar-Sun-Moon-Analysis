from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
ARCHIVE = ROOT / "web" / "public" / "eclipse-live" / "archive" / "2026-08-12.json"


def test_eclipse_live_moves_expired_2026_shadow_experiment_to_archive() -> None:
    live = LIVE.read_text(encoding="utf-8")
    archive = ARCHIVE.read_text(encoding="utf-8")

    assert "ARCHIWUM EKSPERYMENTU" in live
    assert 'href="./archive/2026-08-12.json"' in live
    assert "EUMETSAT Meteosat-12 FCI VIS 0.6 HRFI" in archive
    assert "EUMETSAT Meteosat-12 FCI IR10.5 HRFI" in archive
    assert "NOAA GOES-19 ABI Band 2" in archive
    assert "NASA GSFC Besselian Elements" in archive
    assert '"class": "VISUALIZATION"' in archive


def test_eclipse_live_exposes_official_planetary_eclipse_examples() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "PIA23133" in source
    assert "Phobos przed Słońcem" in source
    assert "PIA26758" in source
    assert "Ziemia znika za Phobosem" in source
    assert "PIA23437" in source
    assert "Cień Io na Jowiszu" in source
    assert "NASA/JPL" in source


def test_eclipse_live_separates_visibility_regions_from_weather_guarantees() -> None:
    source = LIVE.read_text(encoding="utf-8")

    assert "Nie jest to prognoza pogody" in source
    assert "Przed realną obserwacją" in source
    assert "szerokich regionach widoczności NASA" in source
