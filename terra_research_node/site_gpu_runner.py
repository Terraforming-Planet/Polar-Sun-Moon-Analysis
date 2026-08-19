from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from .device import write_device_json
from .site_corpus import SiteImageRecord, build_site_corpus
from .training import TrainingConfig, run_self_supervised_training


def _run_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _load_rgb(path: Path, resolution: int) -> np.ndarray | None:
    try:
        with Image.open(path) as image:
            rgb = ImageOps.fit(
                image.convert("RGB"),
                (resolution, resolution),
                method=Image.Resampling.BILINEAR,
            )
            return np.transpose(np.asarray(rgb, dtype=np.uint8), (2, 0, 1)).copy()
    except (OSError, ValueError):
        return None


def run_gpu_audit(
    repo_root: Path,
    records: list[SiteImageRecord],
    output_dir: Path,
    *,
    resolution: int,
    batch_size: int,
) -> dict[str, Any]:
    """Send every readable corpus image through CUDA once and record neutral image statistics."""
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for the CUDA site-corpus audit.") from exc
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing to call CPU work an L4 audit.")

    output_dir.mkdir(parents=True, exist_ok=True)
    audit_path = output_dir / "gpu_image_audit.jsonl"
    processed = 0
    unreadable: list[str] = []
    device = torch.device("cuda")
    size = max(64, min(resolution, 512))
    batch_limit = max(1, batch_size)

    with audit_path.open("w", encoding="utf-8") as handle:
        for offset in range(0, len(records), batch_limit):
            chunk = records[offset : offset + batch_limit]
            arrays: list[np.ndarray] = []
            accepted: list[SiteImageRecord] = []
            for record in chunk:
                array = _load_rgb(repo_root / record.path, size)
                if array is None:
                    unreadable.append(record.path)
                    continue
                arrays.append(array)
                accepted.append(record)
            if not arrays:
                continue

            tensor = torch.from_numpy(np.stack(arrays)).to(
                device=device, dtype=torch.float32, non_blocking=False
            ).div_(255.0)
            means = tensor.mean(dim=(2, 3))
            stds = tensor.std(dim=(2, 3))
            dx = torch.abs(tensor[:, :, :, 1:] - tensor[:, :, :, :-1]).mean(dim=(1, 2, 3))
            dy = torch.abs(tensor[:, :, 1:, :] - tensor[:, :, :-1, :]).mean(dim=(1, 2, 3))
            edge = (dx + dy) * 0.5
            means_cpu = means.detach().cpu().tolist()
            stds_cpu = stds.detach().cpu().tolist()
            edge_cpu = edge.detach().cpu().tolist()

            for index, record in enumerate(accepted):
                row = {
                    "path": record.path,
                    "sha256": record.sha256,
                    "origin": record.origin,
                    "experiment": record.experiment,
                    "year": record.year,
                    "platform": record.platform,
                    "item_id": record.item_id,
                    "rgb_mean": means_cpu[index],
                    "rgb_std": stds_cpu[index],
                    "edge_energy": edge_cpu[index],
                    "evidence_class": "DERIVED_VALUE",
                    "scientific_finding": False,
                }
                handle.write(json.dumps(row, separators=(",", ":")) + "\n")
                processed += 1
            handle.flush()
            print(
                json.dumps(
                    {
                        "event": "gpu_site_audit",
                        "processed": processed,
                        "total": len(records),
                    }
                ),
                flush=True,
            )

    torch.cuda.synchronize()
    result: dict[str, Any] = {
        "images_in_corpus": len(records),
        "images_processed_gpu": processed,
        "unreadable_count": len(unreadable),
        "unreadable": unreadable,
        "resolution": size,
        "evidence_class": "DERIVED_VALUE",
        "scientific_finding_claim": False,
        "note": (
            "Every readable unique site-corpus image is transferred to CUDA once. The stored RGB "
            "statistics are an image audit, not proof of hydrological or climatic causation."
        ),
    }
    _write_json(output_dir / "gpu_audit_summary.json", result)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Collect every research image exposed by the project site and analyze it on CUDA."
    )
    parser.add_argument("--duration-minutes", type=float, default=60.0)
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--no-remote", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo_root = Path.cwd()
    run_dir = repo_root / "research_runs" / f"site_{_run_id()}"
    run_dir.mkdir(parents=True, exist_ok=True)

    device = write_device_json(run_dir / "device.json")
    if device.get("backend") != "cuda":
        raise RuntimeError("CUDA was not selected. The full site-corpus run requires the L4.")

    records, corpus_manifest = build_site_corpus(repo_root, download_remote=not args.no_remote)
    _write_json(run_dir / "site_corpus_manifest.json", corpus_manifest)
    if len(records) < 4:
        raise RuntimeError("Fewer than four unique readable research images were discovered.")

    print(
        json.dumps(
            {
                "event": "site_corpus_ready",
                "unique_images": len(records),
                "by_experiment": corpus_manifest["counts_by_experiment"],
                "remote_errors": len(corpus_manifest["remote_download_errors"]),
            }
        ),
        flush=True,
    )
    audit = run_gpu_audit(
        repo_root,
        records,
        run_dir,
        resolution=args.resolution,
        batch_size=args.batch_size,
    )

    all_paths = [repo_root / record.path for record in records]
    training_config = TrainingConfig(
        duration_seconds=max(1, int(args.duration_minutes * 60)),
        resolution=args.resolution,
        batch_size=args.batch_size,
        max_images=len(all_paths),
    )
    training = run_self_supervised_training(all_paths, run_dir, training_config)

    training_manifest_path = run_dir / "training_manifest.json"
    training_manifest = json.loads(training_manifest_path.read_text(encoding="utf-8"))
    training_manifest["split_rule"] = (
        "all unique readable site-corpus research images; self-supervised pretraining only"
    )
    training_manifest["site_corpus_all_images_requested"] = True
    _write_json(training_manifest_path, training_manifest)

    summary = {
        "run_id": run_dir.name,
        "device": device,
        "corpus": {
            "unique_image_count": len(records),
            "counts_by_origin": corpus_manifest["counts_by_origin"],
            "counts_by_experiment": corpus_manifest["counts_by_experiment"],
            "remote_download_error_count": len(corpus_manifest["remote_download_errors"]),
        },
        "gpu_audit": audit,
        "training": training,
        "claims": {
            "all_readable_unique_site_images_gpu_audited": (
                audit["images_processed_gpu"] == len(records)
            ),
            "self_supervised_training": True,
            "ground_truth_claim": False,
            "causal_environmental_claim": False,
        },
    }
    _write_json(run_dir / "metrics.json", summary)
    print(json.dumps({"event": "site_run_complete", **summary["claims"]}), flush=True)
    print(f"Run saved to: {run_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
