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
from terra_research_node.water_cycle_training import _model, select_device  # noqa: E402


def load_cached_pairs(
    cache_dir: Path, *, max_pairs: int
) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]]]:
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
    return np.stack(arrays), np.asarray(targets, dtype=np.int64), provenance


def run_training(args: argparse.Namespace) -> dict[str, Any]:
    try:
        torch = import_module("torch")
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for cached CUDA training") from exc
    device_name = select_device(args.device, torch)
    device = torch.device(device_name)
    if device.type != "cuda":
        raise RuntimeError(
            "This launcher requires CUDA; CPU cache replay is intentionally disabled"
        )
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    torch.cuda.reset_peak_memory_stats()
    torch.backends.cudnn.benchmark = True
    torch.set_float32_matmul_precision("high")

    raw_arrays, raw_targets, provenance = load_cached_pairs(
        args.cache_dir, max_pairs=args.max_pairs
    )
    unique_pairs = len(raw_arrays)
    validation_count = max(1, unique_pairs // 10)
    generator = torch.Generator().manual_seed(args.seed)
    order = torch.randperm(unique_pairs, generator=generator).numpy()
    validation_indices = order[:validation_count]
    training_indices = order[validation_count:]
    if not len(training_indices):
        raise RuntimeError("Cache split produced no training pairs")

    all_arrays = torch.from_numpy(raw_arrays).to(device=device, non_blocking=False)
    all_arrays = torch.nan_to_num(all_arrays, nan=0.0, posinf=0.0, neginf=0.0)
    all_targets = torch.from_numpy(raw_targets).to(device=device, non_blocking=False)
    train_index = torch.as_tensor(training_indices, dtype=torch.long, device=device)
    validation_index = torch.as_tensor(validation_indices, dtype=torch.long, device=device)

    model = _model(torch).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    scaler = torch.amp.GradScaler("cuda", enabled=True)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100_000)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "checkpoints" / "latest.pt"
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    step = 0
    exposures = 0
    resumed_from: str | None = None
    candidate = checkpoint_path if checkpoint_path.exists() else args.resume_from
    if candidate is not None and candidate.exists():
        saved = torch.load(candidate, map_location=device, weights_only=True)
        model.load_state_dict(saved["model"])
        if candidate == checkpoint_path:
            optimizer.load_state_dict(saved["optimizer"])
            if "scaler" in saved:
                scaler.load_state_dict(saved["scaler"])
            if "scheduler" in saved:
                scheduler.load_state_dict(saved["scheduler"])
            step = int(saved.get("step", 0))
            exposures = int(saved.get("training_exposures", 0))
        resumed_from = str(candidate)

    started = time.monotonic()
    deadline = started + args.minutes * 60
    last_checkpoint = started
    losses: list[float] = []
    validation_losses: list[float] = []
    status = "COMPLETE"

    def save_checkpoint() -> None:
        torch.save(
            {
                "run_schema": "terra-training-004-cached-gpu-v1",
                "model": model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "scaler": scaler.state_dict(),
                "scheduler": scheduler.state_dict(),
                "step": step,
                "training_exposures": exposures,
                "unique_real_scientific_pairs": unique_pairs,
                "seed": args.seed,
            },
            checkpoint_path,
        )

    print(
        f"CACHED_CUDA_START gpu={torch.cuda.get_device_name(0)} "
        f"unique_real_pairs={unique_pairs} batch={args.batch_size} minutes={args.minutes}",
        flush=True,
    )
    model.train()
    try:
        while time.monotonic() < deadline:
            choice = torch.randint(
                0,
                len(train_index),
                (args.batch_size,),
                device=device,
            )
            indices = train_index[choice]
            batch = all_arrays[indices]
            target = all_targets[indices]
            if step % 2:
                batch = torch.flip(batch, dims=(-1,))
            if step % 4 >= 2:
                batch = torch.flip(batch, dims=(-2,))
            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", dtype=torch.float16, enabled=True):
                loss = torch.nn.functional.cross_entropy(model(batch), target)
            if not bool(torch.isfinite(loss)):
                raise FloatingPointError("NaN/inf cached training loss")
            scale_before = scaler.get_scale()
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            if scaler.get_scale() >= scale_before:
                scheduler.step()
            step += 1
            exposures += len(indices)
            losses.append(float(loss.detach().cpu()))

            now = time.monotonic()
            if step % 100 == 0:
                model.eval()
                with torch.inference_mode(), torch.amp.autocast(
                    "cuda", dtype=torch.float16, enabled=True
                ):
                    validation_loss = torch.nn.functional.cross_entropy(
                        model(all_arrays[validation_index]), all_targets[validation_index]
                    )
                validation_losses.append(float(validation_loss.detach().cpu()))
                model.train()
                print(
                    f"GPU_TRAINING step={step} exposures={exposures} "
                    f"loss={losses[-1]:.6f} validation_loss={validation_losses[-1]:.6f}",
                    flush=True,
                )
            if now - last_checkpoint >= 60:
                save_checkpoint()
                last_checkpoint = now
    except KeyboardInterrupt:
        status = "INTERRUPTED"
    finally:
        save_checkpoint()

    elapsed = time.monotonic() - started
    metrics = {
        "schema": "terra-training-004-cached-gpu-v1",
        "status": status,
        "scope": "cache-replay adaptation; not a claim of unique independent windows",
        "unique_real_scientific_pairs": unique_pairs,
        "training_exposures": exposures,
        "equivalent_epochs": exposures / len(training_indices),
        "validation_pairs": validation_count,
        "steps": step,
        "new_steps_this_invocation": len(losses),
        "elapsed_seconds": elapsed,
        "device": str(device),
        "gpu_name": torch.cuda.get_device_name(0),
        "gpu_peak_vram_mib": torch.cuda.max_memory_allocated() / 1048576,
        "mixed_precision": True,
        "loss_min": min(losses) if losses else None,
        "loss_last": losses[-1] if losses else None,
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
    parser = argparse.ArgumentParser(description="GPU-saturating Training 004 from real cache")
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--minutes", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-pairs", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--seed", type=int, default=4004)
    parser.add_argument("--device", choices=("cuda",), default="cuda")
    parser.add_argument("--resume-from", type=Path)
    args = parser.parse_args()
    if args.minutes < 1 or args.batch_size < 1 or args.max_pairs < 2:
        parser.error("minutes/batch-size must be positive and max-pairs must be at least two")
    run_training(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
