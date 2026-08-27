from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import numpy as np

from terra_research_node.water_cycle_pipeline import split_for_group
from terra_research_node.water_cycle_streaming import (
    DERIVED_TARGET_CONFIG,
    DERIVED_TARGET_CONFIG_HASH,
    StreamState,
    derive_water_change_target,
    run_stream,
)


def record(index: int) -> dict[str, Any]:
    region = f"safe-region-{index}"
    while split_for_group(region) != "train":
        region += "x"
    return {
        "pack_id": f"T004-W30-{index + 1:07d}",
        "category": "green_water_rich",
        "region_id": region,
        "sample_center": {"lat": 50.0, "lon": 10.0},
        "temporal": {
            "mode": "same_season_cross_year",
            "reference_year": 2000,
            "comparison_year": 2020,
        },
        "season": {"primary_window": ["03-01", "05-31"], "secondary_window": ["09-01", "11-30"]},
    }


class FakeSource:
    def acquire(self, value: dict[str, Any]) -> dict[str, Any]:
        arrays = (np.zeros((4, 2, 2), dtype=np.float32), np.ones((4, 2, 2), dtype=np.float32))
        return {
            "arrays": arrays,
            "provenance": {"pack_id": value["pack_id"], "generated_satellite_pixels": False},
        }


class FakeTrainer:
    def __call__(self, batch: list[dict[str, Any]], state: StreamState) -> dict[str, Any]:
        return {"resume_proof": state.consumed > 0, "batch": len(batch)}


class ProviderFailureSource:
    def acquire(self, value: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("USGS M2M download-request failed: RATE_LIMIT exact-provider-detail")


class SlowUnknownSource:
    def acquire(self, value: dict[str, Any]) -> dict[str, Any]:
        time.sleep(0.05)
        raise LookupError("UNKNOWN_cloud_gate")


def write_manifest(path: Path, count: int) -> None:
    path.write_text(
        "".join(json.dumps(record(index)) + "\n" for index in range(count)), encoding="utf-8"
    )


def test_derived_water_change_target_is_versioned_and_directional() -> None:
    before = np.zeros((4, 2, 2), dtype=np.float32)
    before[0], before[2], before[3] = 0.2, 0.3, 0.3
    after = before.copy()
    after[0], after[2], after[3] = 0.5, 0.1, 0.1
    target, score = derive_water_change_target(before, after)
    assert target == 2
    assert score > float(DERIVED_TARGET_CONFIG["threshold"])
    assert DERIVED_TARGET_CONFIG["evidence_class"] == "DERIVED"
    assert DERIVED_TARGET_CONFIG["environmental_ground_truth"] is False
    assert len(DERIVED_TARGET_CONFIG_HASH) == 64


def test_stream_counts_real_consumed_and_resumes(tmp_path: Path) -> None:
    manifest, output = tmp_path / "manifest.jsonl", tmp_path / "run"
    write_manifest(manifest, 100)
    first = run_stream(
        manifest,
        output,
        FakeSource(),
        target=2,
        seed=4,
        workers=2,
        queue_size=2,
        batch_size=2,
        max_attempts=None,
        train_batch=FakeTrainer(),
    )
    assert first["status"] == "PASS"
    assert first["real_scientific_windows_trained"] == 2
    second = run_stream(
        manifest,
        output,
        FakeSource(),
        target=3,
        seed=4,
        workers=2,
        queue_size=2,
        batch_size=1,
        max_attempts=None,
        train_batch=FakeTrainer(),
    )
    assert second["real_scientific_windows_trained"] == 3
    assert second["new_windows_this_invocation"] == 1
    assert second["checkpoint_resume"] is True
    assert len((output / "consumed-provenance.jsonl").read_text().splitlines()) == 3


def test_stream_rejects_frozen_ids(tmp_path: Path) -> None:
    manifest = tmp_path / "bad.jsonl"
    bad = record(0)
    bad["pack_id"] = "B01"
    manifest.write_text(json.dumps(bad) + "\n", encoding="utf-8")
    try:
        run_stream(
            manifest,
            tmp_path / "run",
            FakeSource(),
            target=1,
            seed=4,
            workers=1,
            queue_size=1,
            batch_size=1,
            max_attempts=None,
            train_batch=FakeTrainer(),
        )
    except ValueError as exc:
        assert "Frozen" in str(exc)
    else:
        raise AssertionError("Frozen benchmark record was accepted")


def test_stream_propagates_exact_provider_failure(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.jsonl"
    write_manifest(manifest, 2)
    try:
        run_stream(
            manifest,
            tmp_path / "run",
            ProviderFailureSource(),
            target=1,
            seed=4,
            workers=1,
            queue_size=1,
            batch_size=1,
            max_attempts=None,
            train_batch=FakeTrainer(),
        )
    except RuntimeError as exc:
        assert str(exc) == "USGS M2M download-request failed: RATE_LIMIT exact-provider-detail"
    else:
        raise AssertionError("Provider failure did not reach the coordinator")


def test_stream_first_batch_timeout_is_bounded(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.jsonl"
    write_manifest(manifest, 20)
    started = time.monotonic()
    try:
        run_stream(
            manifest,
            tmp_path / "run",
            SlowUnknownSource(),
            target=1,
            seed=4,
            workers=1,
            queue_size=1,
            batch_size=1,
            max_attempts=None,
            first_batch_timeout_s=0.1,
            heartbeat_interval_s=0.05,
            train_batch=FakeTrainer(),
        )
    except TimeoutError as exc:
        assert "No real scientific batch reached CUDA" in str(exc)
    else:
        raise AssertionError("First-batch deadline was not enforced")
    assert time.monotonic() - started < 2.0
