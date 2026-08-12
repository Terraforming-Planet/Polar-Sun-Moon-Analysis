from datetime import UTC, datetime
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "capture_goes19_eclipse.py"
SPEC = spec_from_file_location("capture_goes19_eclipse", SCRIPT)
assert SPEC and SPEC.loader
MODULE = module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_noaa_full_disk_geocolor_url_uses_year_doy_and_ten_minute_slot() -> None:
    moment = datetime(2026, 8, 12, 17, 47, 53, tzinfo=UTC)
    rounded = MODULE.floor_to_ten_minutes(moment)

    assert rounded == datetime(2026, 8, 12, 17, 40, tzinfo=UTC)
    assert MODULE.noaa_timestamp(rounded) == "20262241740"
    assert MODULE.frame_url(rounded) == (
        "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/"
        "20262241740_GOES19-ABI-FD-GEOCOLOR-1808x1808.jpg"
    )


def test_jpeg_guard_rejects_html_or_tiny_responses() -> None:
    assert MODULE.is_jpeg(b"<html>error</html>") is False
    assert MODULE.is_jpeg(b"\xff\xd8tiny\xff\xd9") is False
    assert MODULE.is_jpeg(b"\xff\xd8" + b"x" * 10_100 + b"\xff\xd9") is True


def test_manifest_labels_frames_as_real_satellite_observations(tmp_path, monkeypatch) -> None:
    manifest_path = tmp_path / "manifest.json"
    monkeypatch.setattr(MODULE, "MANIFEST_PATH", manifest_path)

    manifest = MODULE.load_manifest()

    assert manifest["source"] == "NOAA NESDIS STAR GOES-19 ABI Full Disk GeoColor"
    assert manifest["satellite_photography"] is True
    assert manifest["synthetic"] is False
    assert manifest["cadence_minutes"] == 10
