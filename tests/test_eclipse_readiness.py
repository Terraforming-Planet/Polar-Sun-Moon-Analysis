from datetime import UTC, datetime

from scripts.validate_eclipse_readiness import build_report


def config_fixture() -> dict[str, object]:
    return {
        "verified_times_utc": {
            "totality_path_table_first_row": "2026-08-12T17:02:00Z",
            "greatest_eclipse": "2026-08-12T17:45:53.8Z",
        },
        "capture": {
            "manifest": "does-not-exist.json",
            "poll_interval_seconds": 5,
            "source_nominal_cadence_minutes": 10,
            "synthetic_frames_allowed": False,
        },
        "research_policy": {
            "wgs84_is_reference_frame": True,
            "satellite_observation_must_be_separated_from_prediction": True,
            "model_output_must_not_be_labeled_as_satellite_photography": True,
            "source_url_and_observation_time_required": True,
            "sha256_required_for_captured_frames": True,
        },
    }


def test_pre_totality_phase_is_reported_before_nasa_path_table_start() -> None:
    report = build_report(datetime(2026, 8, 12, 14, 51, tzinfo=UTC), config_fixture())

    assert report["phase"] == "pre-totality-path"
    assert report["capture_policy_ok"] is True
    assert report["research_policy_ok"] is True
    assert report["goes19"] == {
        "available": False,
        "frame_count": 0,
        "latest_observed_utc": None,
    }


def test_totality_path_phase_changes_at_verified_nasa_time() -> None:
    report = build_report(datetime(2026, 8, 12, 17, 2, tzinfo=UTC), config_fixture())

    assert report["phase"] == "totality-path-active-before-maximum"
    assert report["seconds_to_totality_path_table_start"] == 0


def test_post_maximum_phase_changes_after_greatest_eclipse() -> None:
    report = build_report(datetime(2026, 8, 12, 17, 46, tzinfo=UTC), config_fixture())

    assert report["phase"] == "post-maximum"
    assert report["seconds_to_greatest_eclipse"] == 0
