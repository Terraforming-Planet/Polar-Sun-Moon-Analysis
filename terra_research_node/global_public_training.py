from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from .device import write_device_json
from .training import TrainingConfig, _augment, _build_model


class DiskImageDataset:
    def __init__(self, paths: list[Path], resolution: int) -> None:
        self.paths = paths
        self.resolution = resolution

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int) -> np.ndarray:
        path = self.paths[index]
        with Image.open(path) as image:
            rgb = ImageOps.fit(
                image.convert("RGB"),
                (self.resolution, self.resolution),
                method=Image.Resampling.BILINEAR,
            )
            array = np.asarray(rgb, dtype=np.uint8)
        return np.transpose(array, (2, 0, 1)).copy()


def _split_bucket(path: Path) -> int:
    digest = hashlib.sha256(path.as_posix().encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _load_paths(repo_root: Path, max_images: int) -> tuple[list[Path], list[Path], list[Path]]:
    records_path = repo_root / "research_cache" / "global_public_dataset" / "records.jsonl"
    if not records_path.exists():
        raise RuntimeError(
            "Global public dataset manifest is missing. Run global_public_dataset first."
        )
    unique: dict[str, Path] = {}
    for line in records_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        raw = json.loads(line)
        path = Path(str(raw["path"]))
        if not path.is_absolute():
            path = repo_root / path
        if not path.is_file():
            continue
        digest = str(raw.get("sha256") or "")
        if digest:
            unique.setdefault(digest, path)
    paths = sorted(unique.values(), key=lambda path: path.as_posix())
    if max_images > 0:
        paths = paths[:max_images]
    train = [path for path in paths if _split_bucket(path) < 90]
    validation = [path for path in paths if 90 <= _split_bucket(path) < 95]
    test = [path for path in paths if _split_bucket(path) >= 95]
    return train, validation, test


def _evaluate(model: Any, loader: Any, torch: Any, device: Any, max_batches: int = 25) -> float | None:
    model.eval()
    values: list[float] = []
    with torch.no_grad():
        for index, batch in enumerate(loader):
            if index >= max_batches:
                break
            clean = batch.to(device=device, dtype=torch.float32, non_blocking=True).div_(255.0)
            noisy = _augment(clean, torch)
            with torch.amp.autocast("cuda", dtype=torch.float16, enabled=True):
                reconstructed = model(noisy)
                l1 = torch.nn.functional.l1_loss(reconstructed, clean)
                mse = torch.nn.functional.mse_loss(reconstructed, clean)
                loss = l1 + 0.25 * mse
            values.append(float(loss.item()))
    model.train()
    return sum(values) / len(values) if values else None


def run_streaming_training(
    repo_root: Path,
    *,
    duration_minutes: float,
    resolution: int,
    batch_size: int,
    max_images: int,
    workers: int,
) -> dict[str, Any]:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for global CUDA training.") from exc
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; global L4 training requires a CUDA GPU.")

    train_paths, validation_paths, test_paths = _load_paths(repo_root, max_images)
    if len(train_paths) < 16:
        raise RuntimeError(
            f"Only {len(train_paths)} training images are available; harvest more public imagery first."
        )

    run_dir = repo_root / "research_runs" / f"global_{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    run_dir.mkdir(parents=True, exist_ok=True)
    device_info = write_device_json(run_dir / "device.json")
    if device_info.get("backend") != "cuda":
        raise RuntimeError("Device selection did not return CUDA.")

    seed = 20260820
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = True
    device = torch.device("cuda")

    worker_count = max(0, min(workers, os.cpu_count() or 1))
    train_dataset = DiskImageDataset(train_paths, resolution)
    validation_dataset = DiskImageDataset(validation_paths, resolution)
    train_loader = torch.utils.data.DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=worker_count,
        pin_memory=True,
        persistent_workers=worker_count > 0,
        drop_last=False,
    )
    validation_loader = torch.utils.data.DataLoader(
        validation_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=min(2, worker_count),
        pin_memory=True,
        persistent_workers=worker_count > 0 and len(validation_paths) > 0,
        drop_last=False,
    )

    config = TrainingConfig(
        duration_seconds=max(1, int(duration_minutes * 60)),
        resolution=resolution,
        batch_size=batch_size,
        max_images=len(train_paths),
    )
    model = _build_model(torch).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    scaler = torch.amp.GradScaler("cuda", enabled=True)
    deadline = time.monotonic() + config.duration_seconds
    started = time.monotonic()
    losses: list[float] = []
    steps = 0
    samples_seen = 0
    epochs = 0
    last_report = started

    manifest = {
        "schema": "terra-global-public-training-v1",
        "mode": "self_supervised_denoising_pretrain",
        "evidence_class": "DERIVED_VALUE",
        "ground_truth_claim": False,
        "train_unique_images": len(train_paths),
        "validation_unique_images": len(validation_paths),
        "test_unique_images": len(test_paths),
        "split_rule": "SHA-derived deterministic 90/5/5 split",
        "resolution": resolution,
        "batch_size": batch_size,
        "cpu_workers": worker_count,
        "dataset_manifest": "research_cache/global_public_dataset/records.jsonl",
        "note": (
            "samples_seen counts repeated training samples across epochs and must never be reported "
            "as unique satellite images or unique source scenes."
        ),
    }
    (run_dir / "training_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    print(json.dumps({"event": "global_training_ready", **manifest}), flush=True)
    while time.monotonic() < deadline:
        epochs += 1
        for batch in train_loader:
            if time.monotonic() >= deadline:
                break
            clean = batch.to(device=device, dtype=torch.float32, non_blocking=True).div_(255.0)
            noisy = _augment(clean, torch)
            optimizer.zero_grad(set_to_none=True)
            try:
                with torch.amp.autocast("cuda", dtype=torch.float16, enabled=True):
                    reconstructed = model(noisy)
                    l1 = torch.nn.functional.l1_loss(reconstructed, clean)
                    mse = torch.nn.functional.mse_loss(reconstructed, clean)
                    loss = l1 + 0.25 * mse
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            except torch.OutOfMemoryError:
                torch.cuda.empty_cache()
                raise RuntimeError(
                    "CUDA out of memory. Re-run with a smaller --batch-size."
                ) from None
            value = float(loss.detach().item())
            losses.append(value)
            steps += 1
            samples_seen += int(clean.shape[0])
            now = time.monotonic()
            if now - last_report >= 10:
                print(
                    json.dumps(
                        {
                            "event": "global_training_step",
                            "step": steps,
                            "epoch": epochs,
                            "loss": round(value, 6),
                            "samples_seen": samples_seen,
                            "unique_training_images": len(train_paths),
                        }
                    ),
                    flush=True,
                )
                last_report = now

    torch.cuda.synchronize()
    elapsed = time.monotonic() - started
    validation_loss = (
        _evaluate(model, validation_loader, torch, device)
        if validation_paths
        else None
    )
    checkpoint = run_dir / "global_public_earth_pretrain.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "config": config.__dict__ if hasattr(config, "__dict__") else {
                "duration_seconds": config.duration_seconds,
                "resolution": config.resolution,
                "batch_size": config.batch_size,
                "max_images": config.max_images,
                "learning_rate": config.learning_rate,
                "seed": config.seed,
            },
            "steps": steps,
            "epochs": epochs,
            "samples_seen": samples_seen,
            "unique_training_images": len(train_paths),
            "training_mode": "self_supervised_denoising_pretrain",
        },
        checkpoint,
    )

    metrics = {
        "schema": "terra-global-public-training-metrics-v1",
        "completed": True,
        "elapsed_seconds": elapsed,
        "steps": steps,
        "epochs": epochs,
        "samples_seen": samples_seen,
        "unique_training_images": len(train_paths),
        "unique_validation_images": len(validation_paths),
        "unique_test_images": len(test_paths),
        "loss_first": losses[0] if losses else None,
        "loss_last": losses[-1] if losses else None,
        "loss_best": min(losses) if losses else None,
        "validation_loss": validation_loss,
        "checkpoint": checkpoint.as_posix(),
        "ground_truth_claim": False,
        "scientific_finding_claim": False,
        "device": device_info,
    }
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({"event": "global_training_complete", **metrics}, default=str), flush=True)
    print(f"Run saved to: {run_dir}", flush=True)
    return metrics


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stream a large public satellite image dataset from disk into CUDA training."
    )
    parser.add_argument("--duration-minutes", type=float, default=60.0)
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--max-images", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    run_streaming_training(
        Path.cwd(),
        duration_minutes=args.duration_minutes,
        resolution=args.resolution,
        batch_size=args.batch_size,
        max_images=args.max_images,
        workers=args.workers,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
