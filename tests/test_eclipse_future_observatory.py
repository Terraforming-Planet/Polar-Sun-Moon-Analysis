import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CALENDAR = ROOT / "web" / "public" / "eclipse-live" / "eclipse-events.json"
PLANETARY = ROOT / "web" / "public" / "eclipse-live" / "planetary-events.json"
MANIFEST = (
    ROOT
    / "web"
    / "public"
    / "eclipse"
    / "2026-08-12"
    / "goes19-band02"
    / "manifest.json"
)
ARCHIVE = ROOT / "web" / "public" / "eclipse" / "2026-08-12" / "archive.json"
LIVE_MANIFEST = ROOT / "web" / "public" / "eclipse" / "live" / "goes19-band02" / "manifest.json"
CAPTURE_WORKFLOW = ROOT / ".github" / "workflows" / "capture-goes19-band02-eclipse-2026.yml"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_next_eclipse_matches_nasa_gsfc_besselian_record() -> None:
    data = load(CALENDAR)
    assert data["schema"] == "terra-eclipse-calendar/v1"
    assert data["evidence_policy"] == "official-public-only"
    event = next(item for item in data["events"] if item["id"] == data["next_event_id"])

    assert event["id"] == "solar-2027-02-06-annular"
    assert event["greatest_utc"] == "2027-02-06T15:59:32Z"
    assert event["magnitude"] == 0.9281
    assert event["central_duration"] == "07m51s"
    assert event["path_width_km"] == 281.6
    assert event["greatest_point"] == {"latitude": -31.3, "longitude": -48.5}
    assert urlparse(event["official_source"]).netloc == "eclipse.gsfc.nasa.gov"
    assert urlparse(event["official_path_map"]).netloc == "eclipse.gsfc.nasa.gov"


def test_calendar_contains_all_five_2027_nasa_eclipses() -> None:
    data = load(CALENDAR)
    ids = {item["id"] for item in data["events"]}

    assert ids == {
        "solar-2027-02-06-annular",
        "lunar-2027-02-20-penumbral",
        "lunar-2027-07-18-penumbral",
        "solar-2027-08-02-total",
        "lunar-2027-08-17-penumbral",
    }
    assert any(
        item["id"] == "solar-2027-08-02-total" and item["magnitude"] == 1.079
        for item in data["events"]
    )


def test_test_areas_are_explicitly_not_all_official_path_points() -> None:
    data = load(CALENDAR)
    solar = [item for item in data["events"] if item["kind"] == "solar"]

    for event in solar:
        areas = event["test_areas"]
        assert areas
        assert any(area["evidence"] == "official-greatest-point" for area in areas)
        assert any(area["evidence"].startswith("regional-") for area in areas)
        for area in areas:
            assert -90 <= area["latitude"] <= 90
            assert -180 <= area["longitude"] <= 180


def test_planetary_archive_uses_only_official_nasa_or_jpl_sources() -> None:
    data = load(PLANETARY)
    assert data["schema"] == "terra-planetary-eclipse-archive/v1"
    assert data["evidence_policy"] == "official-public-only"
    classes = {item["classification"] for item in data["events"]}
    assert {"transit", "occultation", "eclipse-shadow", "eclipse"} <= classes

    allowed_hosts = {"science.nasa.gov", "www.nasa.gov", "www.jpl.nasa.gov"}
    for event in data["events"]:
        assert urlparse(event["source_url"]).netloc in allowed_hosts
        if event.get("image_url"):
            assert urlparse(event["image_url"]).netloc == "assets.science.nasa.gov"
        assert event.get("pia")


def test_closed_2026_archive_matches_only_event_date_noaa_frames() -> None:
    archive = load(ARCHIVE)
    manifest = load(MANIFEST)

    assert archive["status"] == "closed-historical-archive"
    assert archive["campaign_date"] == manifest["event_date"] == "2026-08-12"
    assert archive["frame_count"] == len(manifest["frames"]) == 5
    assert archive["source"] == manifest["source"]
    assert archive["product"] == manifest["product"]
    assert archive["satellite_observation"] is True
    assert archive["synthetic"] is False
    assert archive["model_overlay"] is False
    assert all(frame["observed_utc"].startswith("2026-08-12T") for frame in manifest["frames"])
    assert all(len(frame["sha256"]) == 64 for frame in manifest["frames"])


def test_post_event_noaa_frame_is_preserved_outside_historical_campaign() -> None:
    live = load(LIVE_MANIFEST)
    assert live["purpose"].startswith("post-event atmospheric context")
    assert len(live["frames"]) == 1
    frame = live["frames"][0]
    assert frame["observed_utc"] == "2026-08-21T15:50:00Z"
    assert frame["file"] == "20260821T155000Z_GOES19_BAND02_1808.jpg"
    assert len(frame["sha256"]) == 64


def test_closed_capture_workflow_is_read_only_and_cannot_append_frames() -> None:
    workflow = CAPTURE_WORKFLOW.read_text(encoding="utf-8")
    assert "permissions:\n  contents: read" in workflow
    assert "verify-closed-archive" in workflow
    assert "This workflow no longer captures or writes new frames." in workflow
    assert "scripts/capture_goes19_band02_eclipse.py" not in workflow
    assert "git push" not in workflow
    assert "schedule:" not in workflow
    assert "branches: [main]" not in workflow
