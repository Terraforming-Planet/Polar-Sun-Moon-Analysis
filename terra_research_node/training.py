from __future__ import annotations

import hashlib
import json
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}
HINTS = {
    "landsat", "sentinel", "satellite", "copernicus", "gibs", "sar",
    "water", "flood", "river", "lake", "published", "experiment", "paleoriver",
}
EXCLUDED = {".git", ".venv", "node_modules", "research_runs", "dist", "__pycache__"}


@dataclass(slots=True)
class TrainingConfig:
    duration_seconds: int
    resolution: int = 512
    batch_size: int = 24
    max_images: int = 768
    learning_rate: float = 2e-4
    seed: int = 20260819


def assess_training_labels(root: Path = Path("data/training")) -> dict[str, Any]:
    masks = [
        path for path in root.rglob("*")
        if path.is_file()
        and path.suffix.lower() in {".tif", ".tiff", ".png"}
        and any(token in path.name.lower() for token in ("mask", "label"))
    ] if root.exists() else []
    groups = {path.parent.name for path in masks}
    sufficient = len(masks) >= 30 and len(groups) >= 3
    return {
        "supervised_training": (
            "eligible" if sufficient else "skipped_insufficient_legitimate_labels"
        ),
        "legitimate_mask_count": len(masks),
        "geography_group_count": len(groups),
        "minimum_masks": 30,
        "minimum_geographies": 3,
        "label_hashes": {
            path.as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in masks
        },
        "note": (
            "Context JSON/CSV is not pixel ground truth. Real imagery may still be used "
            "for self-supervised GPU pretraining."
        ),
    }


def discover_training_images(repo_root: Path, max_images: int = 768) -> list[Path]:
    roots = [
        repo_root / "research_cache",
        repo_root / "cache",
        repo_root / "data",
        repo_root / "docs" / "published",
        repo_root / "web" / "public",
    ]
    found: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            if any(part in EXCLUDED for part in path.parts):
                continue
            lowered = path.as_posix().lower()
            if any(hint in lowered for hint in HINTS):
                found.append(path)
    unique = sorted(set(found), key=lambda item: item.as_posix())
    if len(unique) <= max_images:
        return unique
    rng = random.Random(20260819)
    rng.shuffle(unique)
    return unique[:max_images]


def _load_images(paths: list[Path], resolution: int) -> tuple[np.ndarray, list[str]]:
    arrays: list[np.ndarray] = []
    accepted: list[str] = []
    for path in paths:
        try:
            with Image.open(path) as image:
                rgb = ImageOps.fit(
                    image.convert("RGB"),
                    (resolution, resolution),
                    method=Image.Resampling.BILINEAR,
                )
                array = np.asarray(rgb, dtype=np.uint8)
        except (OSError, ValueError):
            continue
        arrays.append(np.transpose(array, (2, 0, 1)).copy())
        accepted.append(path.as_posix())
    if not arrays:
        shape = (0, 3, resolution, resolution)
        return np.empty(shape, dtype=np.uint8), []
    return np.stack(arrays), accepted


def _build_model(torch: Any) -> Any:
    nn = torch.nn
    return nn.Sequential(
        nn.Conv2d(3, 64, 5, stride=2, padding=2), nn.SiLU(),
        nn.Conv2d(64, 128, 3, stride=2, padding=1), nn.SiLU(),
        nn.Conv2d(128, 256, 3, stride=2, padding=1), nn.SiLU(),
        nn.Conv2d(256, 512, 3, stride=2, padding=1), nn.SiLU(),
        nn.ConvTranspose2d(512, 256, 4, stride=2, padding=1), nn.SiLU(),
        nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1), nn.SiLU(),
        nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1), nn.SiLU(),
        nn.ConvTranspose2d(64, 3, 4, stride=2, padding=1), nn.Sigmoid(),
    )


def _augment(batch: Any, torch: Any) -> Any:
    if torch.rand((), device=batch.device) < 0.5:
        batch = torch.flip(batch, dims=(3,))
    noise = torch.randn_like(batch) * 0.035
    gain = 0.9 + 0.2 * torch.rand((batch.shape[0], 1, 1, 1), device=batch.device)
    return torch.clamp(batch * gain + noise, 0.0, 1.0)


def run_self_supervised_training(
    image_paths: list[Path], output_dir: Path, config: TrainingConfig
) -> dict[str, Any]:
    """Run real gradient training without inventing segmentation ground truth."""
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for L4 training.") from exc
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing to call CPU work L4 training.")

    random.seed(config.seed)
    np.random.seed(config.seed)
    torch.manual_seed(config.seed)
    torch.cuda.manual_seed_all(config.seed)
    torch.backends.cudnn.benchmark = True

    images, accepted = _load_images(image_paths, config.resolution)
    if len(images) < 4:
        raise RuntimeError("Need at least four readable Earth-observation images.")

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "mode": "self_supervised_denoising_pretrain",
        "image_count": len(accepted),
        "images": accepted,
        "config": asdict(config),
        "evidence_class": "DERIVED_VALUE",
        "ground_truth_claim": False,
    }
    (output_dir / "training_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    device = torch.device("cuda")
    model = _build_model(torch).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    scaler = torch.amp.GradScaler("cuda", enabled=True)
    cpu_images = torch.from_numpy(images).pin_memory()
    batch_size = max(1, min(config.batch_size, len(images)))
    started = time.monotonic()
    deadline = started + config.duration_seconds
    losses: list[float] = []
    steps = 0
    samples_seen = 0
    last_report = started

    while time.monotonic() < deadline:
        indices = torch.randint(0, len(images), (batch_size,), device="cpu")
        clean = cpu_images.index_select(0, indices).to(
            device=device, dtype=torch.float32, non_blocking=True
        ).div_(255.0)
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
            if batch_size == 1:
                raise
            batch_size = max(1, batch_size // 2)
            continue

        loss_value = float(loss.detach().item())
        losses.append(loss_value)
        steps += 1
        samples_seen += batch_size
        now = time.monotonic()
        if now - last_report >= 10:
            print(json.dumps({
                "event": "training_step",
                "step": steps,
                "loss": round(loss_value, 6),
                "batch_size": batch_size,
                "samples_seen": samples_seen,
            }), flush=True)
            last_report = now

    torch.cuda.synchronize()
    elapsed = time.monotonic() - started
    checkpoint = output_dir / "earth_observation_pretrain.pt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "config": asdict(config),
        "steps": steps,
        "image_count": len(accepted),
        "training_mode": "self_supervised_denoising_pretrain",
    }, checkpoint)
    metrics: dict[str, Any] = {
        "training_mode": "self_supervised_denoising_pretrain",
        "completed": True,
        "elapsed_seconds": elapsed,
        "steps": steps,
        "samples_seen": samples_seen,
        "image_count": len(accepted),
        "batch_size_final": batch_size,
        "loss_first": losses[0] if losses else None,
        "loss_last": losses[-1] if losses else None,
        "loss_best": min(losses) if losses else None,
        "checkpoint": checkpoint.as_posix(),
        "ground_truth_claim": False,
    }
    (output_dir / "training_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )
    return metrics
