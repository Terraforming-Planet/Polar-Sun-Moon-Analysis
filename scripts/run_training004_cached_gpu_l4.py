from __future__ import annotations

import argparse
import json
import sys
import time
from importlib import import_module
from pathlib import Path
from typing import Any, cast

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from terra_research_node.water_cycle_streaming import (  # noqa: E402
    DERIVED_TARGET_CONFIG,
    DERIVED_TARGET_CONFIG_HASH,
    assert_training_record,
    derive_water_change_target,
    file_sha256,
)
from terra_research_node.water_cycle_training import select_device  # noqa: E402

RUN_SCHEMA = "terra-training-004-masked-spectral-temporal-v2"


def load_cached_pairs(
    cache_dir: Path, *, max_pairs: int
) -> tuple[list[np.ndarray], np.ndarray, list[dict[str, Any]]]:
    """Load real cached pairs without requiring every source raster to have one size."""
    arrays: list[np.ndarray] = []
    targets: list[int] = []
    provenance: list[dict[str, Any]] = []
    for array_path in sorted(cache_dir.glob("*.npz")):
        metadata_path = array_path.with_suffix(".json")
        if not metadata_path.exists():
            continue
        metadata = cast(dict[str, Any], json.loads(metadata_path.read_text(encoding="utf-8")))
        if metadata.get("generated_satellite_pixels") is not False:
            raise ValueError(f"Cache provenance is not real-observation safe: {metadata_path}")
        assert_training_record(metadata)
        with np.load(array_path, allow_pickle=False) as loaded:
            before = np.asarray(loaded["before"], dtype=np.float32)
            after = np.asarray(loaded["after"], dtype=np.float32)
        if before.shape != after.shape or before.ndim != 3 or before.shape[0] != 4:
            raise ValueError(f"Invalid cached temporal pair shape: {array_path} {before.shape}")
        target, score = derive_water_change_target(before, after)
        metadata["derived_target"] = {
            "schema": DERIVED_TARGET_CONFIG["schema"],
            "config_sha256": DERIVED_TARGET_CONFIG_HASH,
            "class": target,
            "score": score,
            "evidence_class": "DERIVED",
            "environmental_ground_truth": False,
        }
        arrays.append(np.concatenate((before, after), axis=0))
        targets.append(target)
        provenance.append(metadata)
        if len(arrays) >= max_pairs:
            break
    if len(arrays) < 2:
        raise RuntimeError(
            f"At least two complete real cached pairs are required; found {len(arrays)}"
        )
    return arrays, np.asarray(targets, dtype=np.int64), provenance


def _masked_temporal_model(torch: Any) -> Any:
    nn = torch.nn

    class MaskedTemporalModel(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Conv2d(8, 64, 5, stride=2, padding=2),
                nn.GroupNorm(8, 64),
                nn.GELU(),
                nn.Conv2d(64, 128, 3, stride=2, padding=1),
                nn.GroupNorm(16, 128),
                nn.GELU(),
                nn.Conv2d(128, 256, 3, stride=2, padding=1),
                nn.GroupNorm(32, 256),
                nn.GELU(),
                nn.Conv2d(256, 384, 3, stride=2, padding=1),
                nn.GroupNorm(32, 384),
                nn.GELU(),
            )
            self.decoder = nn.Sequential(
                nn.ConvTranspose2d(384, 256, 4, stride=2, padding=1),
                nn.GroupNorm(32, 256),
                nn.GELU(),
                nn.ConvTranspose2d(256, 128, 4, stride=2, padding=1),
                nn.GroupNorm(16, 128),
                nn.GELU(),
                nn.ConvTranspose2d(128, 64, 4, stride=2, padding=1),
                nn.GroupNorm(8, 64),
                nn.GELU(),
                nn.ConvTranspose2d(64, 32, 4, stride=2, padding=1),
                nn.GELU(),
                nn.Conv2d(32, 8, 3, padding=1),
            )
            self.change_head = nn.Sequential(
                nn.AdaptiveAvgPool2d(1),
                nn.Flatten(),
                nn.Linear(384, 3),
            )

        def forward(self, value: Any) -> tuple[Any, Any]:
            encoded = self.encoder(value)
            return self.decoder(encoded), self.change_head(encoded)

    return MaskedTemporalModel()


def _uniform_cuda_tensor(
    torch: Any,
    arrays: list[np.ndarray],
    *,
    device: Any,
    canvas_size: int,
) -> Any:
    """Preserve each AOI extent while resampling mixed 256/512 caches to one tensor size."""
    tensors: list[Any] = []
    for array in arrays:
        tensor = torch.from_numpy(np.asarray(array, dtype=np.float32)).unsqueeze(0)
        tensor = torch.nan_to_num(tensor, nan=0.0, posinf=0.0, neginf=0.0)
        tensor = tensor.to(device=device, non_blocking=False)
        if tuple(tensor.shape[-2:]) != (canvas_size, canvas_size):
            tensor = torch.nn.functional.interpolate(
                tensor,
                size=(canvas_size, canvas_size),
                mode="bilinear",
                align_corners=False,
            )
        tensors.append(tensor)
    return torch.cat(tensors).contiguous(memory_format=torch.channels_last)


def _block_mask(torch: Any, batch: int, canvas_size: int, ratio: float, device: Any) -> Any:
    grid_size = max(2, canvas_size // 16)
    coarse = torch.rand((batch, 1, grid_size, grid_size), device=device) < ratio
    return torch.nn.functional.interpolate(
        coarse.float(), size=(canvas_size, canvas_size), mode="nearest"
    ).bool()


def run_training(args: argparse.Namespace) -> dict[str, Any]:
    try:
        torch = import_module("torch")
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for cached CUDA training") from exc
    device_name = select_device(args.device, torch)
    device = torch.device(device_name)
    if device.type != "cuda":
        raise RuntimeError("This launcher requires CUDA")
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    torch.cuda.reset_peak_memory_stats()
    torch.backends.cudnn.benchmark = True
    torch.set_float32_matmul_precision("high")

    raw_arrays, raw_targets, provenance = load_cached_pairs(
        args.cache_dir, max_pairs=args.max_pairs
    )
    source_shapes: dict[str, int] = {}
    for array in raw_arrays:
        shape = "x".join(str(value) for value in array.shape)
        source_shapes[shape] = source_shapes.get(shape, 0) + 1

    unique_pairs = len(raw_arrays)
    validation_count = max(1, unique_pairs // 10)
    split_generator = torch.Generator().manual_seed(args.seed)
    order = torch.randperm(unique_pairs, generator=split_generator).numpy()
    validation_indices = order[:validation_count]
    training_indices = order[validation_count:]
    if not len(training_indices):
        raise RuntimeError("Cache split produced no training pairs")

    all_raw = _uniform_cuda_tensor(
        torch,
        raw_arrays,
        device=device,
        canvas_size=args.canvas_size,
    )
    all_targets = torch.from_numpy(raw_targets).to(device=device, non_blocking=False)
    train_index = torch.as_tensor(training_indices, dtype=torch.long, device=device)
    validation_index = torch.as_tensor(validation_indices, dtype=torch.long, device=device)
    training_raw = all_raw[train_index]
    channel_mean = training_raw.mean(dim=(0, 2, 3), keepdim=True)
    channel_std = training_raw.std(dim=(0, 2, 3), keepdim=True).clamp_min(1e-4)
    all_arrays = ((all_raw - channel_mean) / channel_std).contiguous(
        memory_format=torch.channels_last
    )

    model = _masked_temporal_model(torch).to(device)
    model = model.to(memory_format=torch.channels_last)
    try:
        optimizer = torch.optim.AdamW(
            model.parameters(), lr=args.learning_rate, weight_decay=1e-4, fused=True
        )
    except (RuntimeError, TypeError):
        optimizer = torch.optim.AdamW(
            model.parameters(), lr=args.learning_rate, weight_decay=1e-4
        )
    scaler = torch.amp.GradScaler("cuda", enabled=True)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=250_000)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "checkpoints" / "latest.pt"
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    step = 0
    exposures = 0
    effective_batch_size = args.batch_size
    resumed_from: str | None = None
    if checkpoint_path.exists():
        saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
        if saved.get("run_schema") != RUN_SCHEMA:
            raise ValueError("Cached GPU checkpoint schema mismatch; use a new output directory")
        model.load_state_dict(saved["model"])
        optimizer.load_state_dict(saved["optimizer"])
        if "scaler" in saved:
            scaler.load_state_dict(saved["scaler"])
        if "scheduler" in saved:
            scheduler.load_state_dict(saved["scheduler"])
        step = int(saved.get("step", 0))
        exposures = int(saved.get("training_exposures", 0))
        effective_batch_size = int(saved.get("effective_batch_size", args.batch_size))
        resumed_from = str(checkpoint_path)

    validation_batch = all_arrays[validation_index]
    validation_target = all_targets[validation_index]
    validation_mask = _block_mask(
        torch,
        len(validation_index),
        args.canvas_size,
        args.mask_ratio,
        device,
    )
    validation_input = validation_batch.masked_fill(validation_mask, 0.0)

    started = time.monotonic()
    deadline = started + args.minutes * 60
    last_checkpoint = started
    reported_losses: list[float] = []
    reported_reconstruction_losses: list[float] = []
    validation_losses: list[float] = []
    status = "COMPLETE"
    failure: str | None = None

    def save_checkpoint() -> None:
        torch.save(
            {
                "run_schema": RUN_SCHEMA,
                "model": model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "scaler": scaler.state_dict(),
                "scheduler": scheduler.state_dict(),
                "step": step,
                "training_exposures": exposures,
                "unique_real_scientific_pairs": unique_pairs,
                "effective_batch_size": effective_batch_size,
                "canvas_size": args.canvas_size,
                "seed": args.seed,
            },
            checkpoint_path,
        )

    print(
        f"CACHED_SSL_CUDA_START gpu={torch.cuda.get_device_name(0)} "
        f"unique_real_pairs={unique_pairs} requested_batch={args.batch_size} "
        f"canvas={args.canvas_size} mask={args.mask_ratio:.2f} minutes={args.minutes} "
        f"source_shapes={source_shapes}",
        flush=True,
    )
    model.train()
    try:
        while time.monotonic() < deadline:
            choice = indices = batch = target = mask = masked = None
            reconstruction = logits = loss_map = None
            reconstruction_loss = change_loss = loss = None
            try:
                choice = torch.randint(
                    0,
                    len(train_index),
                    (effective_batch_size,),
                    device=device,
                )
                indices = train_index[choice]
                batch = all_arrays[indices]
                target = all_targets[indices]
                if step % 2:
                    batch = torch.flip(batch, dims=(-1,))
                if step % 4 >= 2:
                    batch = torch.flip(batch, dims=(-2,))
                mask = _block_mask(
                    torch,
                    effective_batch_size,
                    args.canvas_size,
                    args.mask_ratio,
                    device,
                )
                masked = batch.masked_fill(mask, 0.0).contiguous(
                    memory_format=torch.channels_last
                )
                optimizer.zero_grad(set_to_none=True)
                with torch.amp.autocast("cuda", dtype=torch.float16, enabled=True):
                    reconstruction, logits = model(masked)
                    loss_map = torch.nn.functional.smooth_l1_loss(
                        reconstruction, batch, reduction="none"
                    )
                    reconstruction_loss = loss_map.masked_select(
                        mask.expand_as(loss_map)
                    ).mean()
                    change_loss = torch.nn.functional.cross_entropy(
                        logits, target, label_smoothing=0.02
                    )
                    loss = reconstruction_loss + 0.05 * change_loss
                scale_before = scaler.get_scale()
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
                if scaler.get_scale() >= scale_before:
                    scheduler.step()
                step += 1
                exposures += effective_batch_size
            except torch.OutOfMemoryError:
                optimizer.zero_grad(set_to_none=True)
                choice = indices = batch = target = mask = masked = None
                reconstruction = logits = loss_map = None
                reconstruction_loss = change_loss = loss = None
                torch.cuda.empty_cache()
                if effective_batch_size <= 8:
                    raise
                effective_batch_size = max(8, effective_batch_size // 2)
                print(
                    f"CUDA_BATCH_AUTOTUNE effective_batch={effective_batch_size}",
                    flush=True,
                )
                continue

            now = time.monotonic()
            if step % 100 == 0:
                if not bool(torch.isfinite(loss)):
                    raise FloatingPointError("NaN/inf masked spectral-temporal loss")
                model.eval()
                with torch.inference_mode(), torch.amp.autocast(
                    "cuda", dtype=torch.float16, enabled=True
                ):
                    validation_reconstruction, validation_logits = model(validation_input)
                    validation_map = torch.nn.functional.smooth_l1_loss(
                        validation_reconstruction,
                        validation_batch,
                        reduction="none",
                    )
                    validation_reconstruction_loss = validation_map.masked_select(
                        validation_mask.expand_as(validation_map)
                    ).mean()
                    validation_change_loss = torch.nn.functional.cross_entropy(
                        validation_logits,
                        validation_target,
                    )
                    validation_loss = (
                        validation_reconstruction_loss + 0.05 * validation_change_loss
                    )
                train_value = float(loss.detach().cpu())
                reconstruction_value = float(reconstruction_loss.detach().cpu())
                validation_value = float(validation_loss.detach().cpu())
                reported_losses.append(train_value)
                reported_reconstruction_losses.append(reconstruction_value)
                validation_losses.append(validation_value)
                model.train()
                print(
                    f"GPU_SSL_TRAINING step={step} exposures={exposures} "
                    f"batch={effective_batch_size} loss={train_value:.6f} "
                    f"reconstruction={reconstruction_value:.6f} "
                    f"validation={validation_value:.6f}",
                    flush=True,
                )
            if now - last_checkpoint >= 60:
                save_checkpoint()
                last_checkpoint = now
    except KeyboardInterrupt:
        status = "INTERRUPTED"
    except Exception as exc:  # noqa: BLE001
        status = "FAILED"
        failure = f"{type(exc).__name__}: {exc}"
    finally:
        save_checkpoint()

    elapsed = time.monotonic() - started
    metrics = {
        "schema": RUN_SCHEMA,
        "status": status,
        "blocker": failure,
        "scope": (
            "masked spectral-temporal cache adaptation; augmented exposures are not "
            "independent observation windows"
        ),
        "objective": "masked eight-channel before/after reconstruction plus derived change head",
        "unique_real_scientific_pairs": unique_pairs,
        "source_shape_counts": source_shapes,
        "canvas_size": args.canvas_size,
        "mask_ratio": args.mask_ratio,
        "training_exposures": exposures,
        "equivalent_epochs": exposures / len(training_indices),
        "validation_pairs": validation_count,
        "steps": step,
        "elapsed_seconds": elapsed,
        "device": str(device),
        "gpu_name": torch.cuda.get_device_name(0),
        "gpu_peak_vram_mib": torch.cuda.max_memory_allocated() / 1048576,
        "requested_batch_size": args.batch_size,
        "effective_batch_size": effective_batch_size,
        "mixed_precision": True,
        "loss_min": min(reported_losses) if reported_losses else None,
        "loss_last": reported_losses[-1] if reported_losses else None,
        "reconstruction_loss_last": (
            reported_reconstruction_losses[-1]
            if reported_reconstruction_losses
            else None
        ),
        "validation_loss_last": validation_losses[-1] if validation_losses else None,
        "checkpoint": str(checkpoint_path),
        "checkpoint_sha256": file_sha256(checkpoint_path),
        "resumed_from": resumed_from,
        "generated_satellite_pixels": False,
        "environmental_ground_truth": False,
        "test001_leakage": False,
        "benchmark_leakage": False,
        "mission_leakage": False,
        "provenance_records": len(provenance),
    }
    (args.output_dir / "summary.json").write_text(
        json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(metrics, sort_keys=True), flush=True)
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(
        description="GPU-saturating masked Training 004 from real cached observations"
    )
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--minutes", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--max-pairs", type=int, default=256)
    parser.add_argument("--canvas-size", type=int, default=256)
    parser.add_argument("--mask-ratio", type=float, default=0.40)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--seed", type=int, default=4004)
    parser.add_argument("--device", choices=("cuda",), default="cuda")
    args = parser.parse_args()
    if args.minutes < 1 or args.batch_size < 1 or args.max_pairs < 2:
        parser.error("minutes/batch-size must be positive and max-pairs must be at least two")
    if args.canvas_size < 64 or args.canvas_size % 16:
        parser.error("canvas-size must be at least 64 and divisible by 16")
    if not 0.05 <= args.mask_ratio <= 0.90:
        parser.error("mask-ratio must be between 0.05 and 0.90")
    metrics = run_training(args)
    return 0 if metrics["status"] in {"COMPLETE", "INTERRUPTED"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
