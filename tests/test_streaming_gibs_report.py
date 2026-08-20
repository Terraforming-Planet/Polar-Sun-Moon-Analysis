from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "publish_streaming_gibs_run.py"
SPEC = importlib.util.spec_from_file_location("publish_streaming_gibs_run", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_streaming_report_keeps_window_and_scene_counts_distinct() -> None:
    metrics = {
        "run_id": "stream_gibs_test",
        "remote_unique_windows_trained": 200016,
        "remote_unique_content_sha256": 156863,
        "candidate_window_pool": 518400,
        "target_remote_windows": 200000,
        "elapsed_seconds": 3293.797,
        "samples_seen": 200345,
        "steps": 8348,
        "remote_download_bytes": 1822759168,
        "failures": 2,
        "loss_first": 0.2588890492916107,
        "loss_last": 0.06958069652318954,
        "loss_best": 0.011324094608426094,
    }
    scan = {
        "line_count": 200016,
        "unique_content_sha256": 156863,
        "payload_bytes": 1822759168,
        "counts_by_region": {"A": 100008, "B": 100008},
        "counts_by_year": {"2025": 100008, "2026": 100008},
        "counts_by_month": {"03": 100008, "09": 100008},
        "earliest_observation_date": "2025-03-15",
        "latest_observation_date": "2026-09-15",
    }
    analysis = MODULE.derive(metrics, scan, 2)

    assert analysis["target_completion_percent"] > 100.0
    assert analysis["content_unique_percent"] < 100.0
    assert analysis["duplicate_content_windows"] == 43153
    assert analysis["log_cross_checks"]["line_count_matches_metrics"] is True
    assert analysis["scientific_finding_claim"] is False
    assert analysis["causal_environmental_claim"] is False
    assert any(item["class"] == "UNKNOWN" for item in analysis["findings"])
