from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .device import write_device_json
from .training import (
    TrainingConfig,
    assess_training_labels,
    discover_training_dataset,
    run_self_supervised_training,
)


def _run_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run real local CUDA pretraining for Terra Earth-observation research."
    )
    parser.add_argument("--duration-minutes", type=float, default=60.0)
    parser.add_argument("--start-year", type=int, default=1990)
    parser.add_argument("--end-year", type=int, default=2026)
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--max-images", type=int, default=768)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo_root = Path.cwd()
    run_dir = repo_root / "research_runs" / _run_id()
    run_dir.mkdir(parents=True, exist_ok=True)

    device = write_device_json(run_dir / "device.json")
    config = {
        "start_year": args.start_year,
        "end_year": args.end_year,
        "duration_minutes": args.duration_minutes,
        "resolution": args.resolution,
        "requested_batch_size": args.batch_size,
        "max_images": args.max_images,
        "purpose": (
            "Self-supervised Earth-observation pretraining for later water/river fine-tuning."
        ),
    }
    _write_json(run_dir / "config.json", config)

    labels = assess_training_labels(repo_root / "data" / "training")
    _write_json(run_dir / "label_audit.json", labels)

    records, dataset_manifest = discover_training_dataset(
        repo_root,
        start_year=args.start_year,
        end_year=args.end_year,
        max_images=args.max_images,
    )
    _write_json(run_dir / "dataset_manifest.json", dataset_manifest)
    train_records = [record for record in records if record.split == "train"]
    train_images = [repo_root / record.path for record in train_records]
    _write_json(
        run_dir / "source_manifest.json",
        {
            "dataset_schema": dataset_manifest["schema"],
            "selected_count": dataset_manifest["selected_count"],
            "train_image_count": len(train_images),
            "validation_count": sum(record.split == "validation" for record in records),
            "test_count": sum(record.split == "test" for record in records),
            "counts_by_source": dataset_manifest["counts_by_source"],
            "counts_by_domain": dataset_manifest["counts_by_domain"],
            "source_rule": (
                "local cached/published Earth-observation imagery; deterministic train/validation/test split"
            ),
        },
    )

    print(json.dumps({"event": "device", **device}), flush=True)
    print(
        json.dumps(
            {
                "event": "dataset_ready",
                "selected_count": len(records),
                "train_count": len(train_images),
                "validation_count": sum(record.split == "validation" for record in records),
                "test_count": sum(record.split == "test" for record in records),
                "counts_by_source": dataset_manifest["counts_by_source"],
                "counts_by_domain": dataset_manifest["counts_by_domain"],
            }
        ),
        flush=True,
    )
    print(
        json.dumps(
            {
                "event": "training_input",
                "image_count": len(train_images),
                "supervised_status": labels["supervised_training"],
                "run_dir": run_dir.as_posix(),
            }
        ),
        flush=True,
    )

    if device.get("backend") != "cuda":
        raise RuntimeError("CUDA was not selected. L4 training will not be faked on CPU.")

    training_config = TrainingConfig(
        duration_seconds=max(1, int(args.duration_minutes * 60)),
        resolution=args.resolution,
        batch_size=args.batch_size,
        max_images=args.max_images,
    )
    metrics = run_self_supervised_training(train_images, run_dir, training_config)
    summary = {
        "started_at": run_dir.name,
        "completed_at": datetime.now(UTC).isoformat(),
        "dataset": {
            "schema": dataset_manifest["schema"],
            "selected_count": dataset_manifest["selected_count"],
            "train_count": len(train_images),
            "counts_by_source": dataset_manifest["counts_by_source"],
            "counts_by_domain": dataset_manifest["counts_by_domain"],
        },
        "training": metrics,
        "supervised_label_audit": labels,
        "device": device,
    }
    _write_json(run_dir / "metrics.json", summary)
    print(json.dumps({"event": "training_complete", **metrics}), flush=True)
    print(f"Run saved to: {run_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
