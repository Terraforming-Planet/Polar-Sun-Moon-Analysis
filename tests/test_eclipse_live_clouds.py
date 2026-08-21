from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
CALENDAR = ROOT / "web" / "public" / "eclipse-live" / "eclipse-events.json"


def test_eclipse_observatory_keeps_real_visible_satellite_sources() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "mtg_fd:vis06_hrfi" in source
    assert "mtg_fd:rgb_geocolour" not in source
    assert "view.eumetsat.int/geoserver/wms" in source
    assert "EUMETSAT Meteosat-12" in source
    assert "NOAA GOES-19" in source
    assert "Zdjęcie satelitarne = obserwacja" in source
    assert "nie jest prognozą pogody na 2027" in source


def test_eclipse_observatory_has_live_countdown_to_official_calendar_event() -> None:
    source = PAGE.read_text(encoding="utf-8")
    calendar = CALENDAR.read_text(encoding="utf-8")

    for element_id in ("count-days", "count-hours", "count-minutes", "count-seconds"):
        assert f'id="{element_id}"' in source
    assert "setInterval(tickCountdown,1000)" in source
    assert "./eclipse-events.json" in source
    assert '"next_event_id": "solar-2027-02-06-annular"' in calendar
    assert '"greatest_utc": "2027-02-06T15:59:32Z"' in calendar
    assert '"magnitude": 0.9281' in calendar
    assert '"path_width_km": 281.6' in calendar


def test_eclipse_observatory_exposes_3d_research_areas_without_faking_path_limits() -> None:
    source = PAGE.read_text(encoding="utf-8")
    calendar = CALENDAR.read_text(encoding="utf-8")

    assert 'id="event-select"' in source
    assert 'id="area-select"' in source
    assert 'id="future-cesium"' in source
    assert "OpenStreetMapImageryProvider" in source
    assert "PUNKT TESTOWY" in source
    assert "marker „obszar testowy” jest punktem badawczym do ustawienia kamery, a nie granicą pasa zaćmienia" in source
    assert "SEsearchmap.php?Ecl=20270206" in calendar
    assert '"evidence": "official-greatest-point"' in calendar
    assert '"evidence": "regional-test-point"' in calendar


def test_2026_campaign_is_presented_as_closed_integrity_archive() -> None:
    source = PAGE.read_text(encoding="utf-8")

    assert "Zamknięta kampania obserwacyjna 2026" in source
    assert "../eclipse/2026-08-12/archive.json" in source
    assert "../eclipse/2026-08-12/goes19-band02/manifest.json" in source
    assert "SHA-256" in source
    assert "Model NASA i render Cesium nie są wypalane w surowe obrazy satelitarne" in source
