import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "web" / "public" / "eclipse-live" / "index.html"
SCRIPT = ROOT / "web" / "public" / "eclipse-live" / "eclipse-live.js"
STYLE = ROOT / "web" / "public" / "eclipse-live" / "eclipse-live.css"
DOCS_STYLE = ROOT / "docs" / "eclipse-live" / "eclipse-live.css"
ARCHIVE = ROOT / "web" / "public" / "eclipse-live" / "archive" / "2026-08-12.json"


def test_eclipse_live_has_separate_solar_and_lunar_countdowns() -> None:
    html = LIVE.read_text(encoding="utf-8")
    script = SCRIPT.read_text(encoding="utf-8")
    style = STYLE.read_text(encoding="utf-8")

    assert "NAJBLIŻSZE ZAĆMIENIE SŁOŃCA" in html
    assert "NAJBLIŻSZE ZAĆMIENIE KSIĘŻYCA" in html
    assert 'id="solar-count-days"' in html
    assert 'id="solar-count-hours"' in html
    assert 'id="solar-count-minutes"' in html
    assert 'id="solar-count-seconds"' in html
    assert 'id="lunar-count-days"' in html
    assert 'id="lunar-count-hours"' in html
    assert 'id="lunar-count-minutes"' in html
    assert 'id="lunar-count-seconds"' in html
    assert 'id="solar-next-total"' in html
    assert 'id="lunar-next-after"' in html
    assert "function nextSolar" in script
    assert "function nextLunar" in script
    assert "renderCountdownFor(solar, 'solar')" in script
    assert "renderCountdownFor(lunar, 'lunar')" in script
    assert 'countdown-panel[aria-label*="Słońca"]' in style
    assert 'countdown-panel[aria-label*="Księżyca"]' in style
    assert "display:block!important" in style
    assert STYLE.read_text(encoding="utf-8") == DOCS_STYLE.read_text(encoding="utf-8")
    assert "2026-08-28T04:13:00Z" in script
    assert "04:14:04 TD" in script
    assert "2027-02-06T16:00:00Z" in script
    assert "2027-08-02T10:07:00Z" in script
    assert "UT rounded to nearest minute" in script
    assert "główny licznik tej zakładki" in html


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
    assert payload["event"]["greatest_eclipse_ut"] == "2026-08-12T17:46:00Z"
    assert payload["event"]["catalog_greatest_td"] == "2026-08-12T17:47:06 TD"
    assert payload["project_test_site"]["name"].startswith("Olszówka")
    classes = {item["source"]: item["class"] for item in payload["evidence_classes"]}
    assert classes["EUMETSAT Meteosat-12 FCI VIS 0.6 HRFI"] == "OFFICIAL_SATELLITE_OBSERVATION"
    assert classes["NOAA GOES-19 ABI Band 2"] == "OFFICIAL_SATELLITE_OBSERVATION"
    assert classes["NASA GSFC Besselian Elements"] == "OFFICIAL_GEOMETRIC_MODEL"
    assert classes["Cesium"] == "VISUALIZATION"
