import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
SCRIPT = ROOT / "web" / "public" / "eclipse-live" / "eclipse-live.js"
ARCHIVE = ROOT / "web" / "public" / "eclipse-live" / "archive" / "2026-08-12.json"


def test_eclipse_live_counts_down_to_next_nasa_catalog_event() -> None:
    html = LIVE.read_text(encoding="utf-8")
    script = SCRIPT.read_text(encoding="utf-8")

    assert "NAJBLIŻSZE ZAĆMIENIE" in html
    assert "count-seconds" in html
    assert "countdown to greatest eclipse" in script
    assert "2026-08-28T04:14:04Z" in script
    assert "2027-02-06T16:00:47Z" in script
    assert "2027-08-02T10:07:49Z" in script
    assert "NASA GSFC Five Millennium Catalog" in script


def test_eclipse_live_keeps_olszowka_and_representative_test_areas() -> None:
    html = LIVE.read_text(encoding="utf-8")
    script = SCRIPT.read_text(encoding="utf-8")

    assert "Wybierz obszar testowy" in html
    assert "Olszówka" in script
    assert "53.61586" in script
    assert "18.99546" in script
    assert "Lisbon" in script
    assert "Dakar" in script
    assert "New York" in script
    assert "Santiago" in script
    assert "Honolulu" in script
    assert "not a weather forecast" in script


def test_2026_eclipse_is_archived_with_evidence_classes() -> None:
    payload = json.loads(ARCHIVE.read_text(encoding="utf-8"))

    assert payload["status"] == "archived"
    assert payload["event"]["greatest_eclipse_utc"] == "2026-08-12T17:47:05Z"
    assert payload["project_test_site"]["name"].startswith("Olszówka")
    classes = {item["source"]: item["class"] for item in payload["evidence_classes"]}
    assert classes["EUMETSAT Meteosat-12 FCI VIS 0.6 HRFI"] == "OFFICIAL_SATELLITE_OBSERVATION"
    assert classes["NOAA GOES-19 ABI Band 2"] == "OFFICIAL_SATELLITE_OBSERVATION"
    assert classes["NASA GSFC Besselian Elements"] == "OFFICIAL_GEOMETRIC_MODEL"
    assert classes["Cesium"] == "VISUALIZATION"
