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

from terra_research_node.training004_sources.landsat import RasterioCogBackend  # noqa: E402
from terra_research_node.water_cycle_acquisition import (  # noqa: E402
    PlanetaryComputerLandsatSearcher,
    UsgsLandsatSearcher,
)
from terra_research_node.water_cycle_streaming import (  # noqa: E402
    DERIVED_TARGET_CONFIG,
    DERIVED_TARGET_CONFIG_HASH,
    CachedPairSource,
    LandsatPairSource,
    StreamState,
    derive_water_change_target,
    file_sha256,
    run_stream,
)
from terra_research_node.water_cycle_training import _model, select_device  # noqa: E402


class TorchBatchTrainer:
    MILESTONES = (1_000, 10_000, 50_000, 200_000, 500_000)

    def __init__(self, root: Path, device_request: str, seed: int):
        try:
            self.torch = import_module("torch")
        except ImportError as exc:
            raise RuntimeError("PyTorch is required for Training #4 streaming") from exc
        self.root, self.seed = root, seed
        name = select_device(device_request, self.torch)
        self.device = self.torch.device(name)
        self.torch.manual_seed(seed)
        if name == "cuda":
            self.torch.cuda.manual_seed_all(seed)
            self.torch.cuda.reset_peak_memory_stats()
        self.model = _model(self.torch).to(self.device)
        self.optimizer = self.torch.optim.AdamW(self.model.parameters(), lr=2e-4)
        self.scaler = self.torch.amp.GradScaler("cuda", enabled=self.device.type == "cuda")
        self.scheduler = self.torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=50_000
        )
        self.checkpoint = root / "checkpoints" / "latest.pt"
        self.losses: list[float] = []
        self.adaptive_batch_size: int | None = None
        self.steps = 0
        self.resumed_count = 0
        if self.checkpoint.exists():
            saved = self.torch.load(self.checkpoint, map_location=self.device, weights_only=True)
            if saved.get("run_schema") != "terra-training-004-real-streaming-v1":
                raise ValueError("Training checkpoint schema mismatch")
            if int(saved["seed"]) != seed:
                raise ValueError("Training checkpoint seed mismatch")
            self.model.load_state_dict(saved["model"])
            self.optimizer.load_state_dict(saved["optimizer"])
            self.scheduler.load_state_dict(saved["scheduler"])
            if "scaler" in saved:
                self.scaler.load_state_dict(saved["scaler"])
            self.steps = int(saved["step"])
            self.resumed_count = int(saved["trained_scientific_window_count"])

    def __call__(self, batch: list[dict[str, Any]], state: StreamState) -> dict[str, Any]:
        started = time.monotonic()
        arrays: list[np.ndarray] = []
        targets: list[int] = []
        for row in batch:
            before, after = cast(tuple[np.ndarray, np.ndarray], row["arrays"])
            target_class, score = derive_water_change_target(before, after)
            arrays.append(np.concatenate((before, after)))
            targets.append(target_class)
            provenance = cast(dict[str, Any], row["provenance"])
            provenance["derived_target"] = {
                "schema": DERIVED_TARGET_CONFIG["schema"],
                "config_sha256": DERIVED_TARGET_CONFIG_HASH,
                "config": DERIVED_TARGET_CONFIG,
                "class": target_class,
                "score": score,
                "evidence_class": "DERIVED",
                "environmental_ground_truth": False,
            }
        target_height = min(int(array.shape[-2]) for array in arrays)
        target_width = min(int(array.shape[-1]) for array in arrays)
        normalized_arrays: list[Any] = []
        for array in arrays:
            value = self.torch.from_numpy(np.asarray(array, dtype=np.float32)).unsqueeze(0)
            value = self.torch.nan_to_num(value, nan=0.0, posinf=0.0, neginf=0.0)
            if tuple(value.shape[-2:]) != (target_height, target_width):
                value = self.torch.nn.functional.interpolate(
                    value,
                    size=(target_height, target_width),
                    mode="bilinear",
                    align_corners=False,
                )
            normalized_arrays.append(value.squeeze(0))
        cpu_tensor = self.torch.stack(normalized_arrays)
        if self.device.type == "cuda":
            cpu_tensor = cpu_tensor.pin_memory()
        tensor = cpu_tensor.to(device=self.device, dtype=self.torch.float32, non_blocking=True)
        tensor = self.torch.nan_to_num(tensor, nan=0.0, posinf=0.0, neginf=0.0)
        target = self.torch.tensor(targets, dtype=self.torch.long, device=self.device)
        limit = min(self.adaptive_batch_size or len(batch), len(batch))
        offset = 0
        while offset < len(batch):
            chunk_size = min(limit, len(batch) - offset)
            try:
                self.optimizer.zero_grad(set_to_none=True)
                with self.torch.amp.autocast(
                    "cuda", dtype=self.torch.float16, enabled=self.device.type == "cuda"
                ):
                    loss = self.torch.nn.functional.cross_entropy(
                        self.model(tensor[offset : offset + chunk_size]),
                        target[offset : offset + chunk_size],
                    )
                if not bool(self.torch.isfinite(loss)):
                    raise FloatingPointError("NaN/inf training loss")
                scale_before = self.scaler.get_scale()
                self.scaler.scale(loss).backward()
                self.scaler.step(self.optimizer)
                self.scaler.update()
                if self.scaler.get_scale() >= scale_before:
                    self.scheduler.step()
                self.steps += 1
                self.losses.append(float(loss.detach().cpu()))
                offset += chunk_size
            except self.torch.OutOfMemoryError:
                if chunk_size == 1:
                    raise
                self.optimizer.zero_grad(set_to_none=True)
                self.torch.cuda.empty_cache()
                limit = max(1, chunk_size // 2)
                self.adaptive_batch_size = limit
        if self.adaptive_batch_size is None:
            self.adaptive_batch_size = len(batch)
        count = state.consumed + len(batch)
        self.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        checkpoint_payload = {
                "run_schema": "terra-training-004-real-streaming-v1",
                "model": self.model.state_dict(),
                "optimizer": self.optimizer.state_dict(),
                "scaler": self.scaler.state_dict(),
                "scheduler": self.scheduler.state_dict(),
                "step": self.steps,
                "trained_scientific_window_count": count,
                "acquisition_cursor": state.cursor,
                "seed": self.seed,
            }
        self.torch.save(checkpoint_payload, self.checkpoint)
        for milestone in self.MILESTONES:
            milestone_path = self.checkpoint.parent / f"milestone-{milestone}.pt"
            if self.resumed_count < milestone <= count and not milestone_path.exists():
                self.torch.save(checkpoint_payload, milestone_path)
        values = self.losses
        return {
            "model_architecture": "temporal-conv-v0-8ch-7class",
            "objective": "derived temporal NDWI/MNDWI water-signal change classification",
            "derived_target_config": DERIVED_TARGET_CONFIG,
            "derived_target_config_sha256": DERIVED_TARGET_CONFIG_HASH,
            "target_evidence_class": "DERIVED",
            "environmental_ground_truth": False,
            "mixed_precision": self.device.type == "cuda",
            "pinned_memory": self.device.type == "cuda",
            "automatic_batch_size": self.adaptive_batch_size,
            "normalized_batch_dimensions": [target_height, target_width],
            "steps": self.steps,
            "loss_min": min(values),
            "loss_mean": sum(values) / len(values),
            "loss_max": max(values),
            "last_training_step_seconds": time.monotonic() - started,
            "checkpoint_path": str(self.checkpoint),
            "checkpoint_sha256": file_sha256(self.checkpoint),
            "resume_proof": self.resumed_count > 0 and count > self.resumed_count,
            "resumed_scientific_window_count": self.resumed_count,
            "gpu_peak_vram_mib": (
                self.torch.cuda.max_memory_allocated() / 1048576
                if self.device.type == "cuda"
                else None
            ),
            "device": str(self.device),
            "gpu_name": (
                self.torch.cuda.get_device_name(0) if self.device.type == "cuda" else None
            ),
            "torch_version": str(self.torch.__version__),
            "cuda_runtime": str(self.torch.version.cuda) if self.torch.version.cuda else None,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Real bounded-memory Training #4 Landsat streamer")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--target-real-windows", type=int, required=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--max-in-flight", type=int, default=8)
    parser.add_argument("--max-attempts", type=int)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--bootstrap-batch-size", type=int, default=1)
    parser.add_argument("--window-size", type=int, default=256)
    parser.add_argument("--seed", type=int, default=4004)
    parser.add_argument(
        "--provider",
        choices=("planetary-computer", "usgs-m2m"),
        default="usgs-m2m",
    )
    parser.add_argument("--device", choices=("cuda", "cpu", "auto"), default="cuda")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--first-batch-timeout-seconds", type=float)
    parser.add_argument("--no-progress-timeout-seconds", type=float)
    parser.add_argument("--max-runtime-seconds", type=float)
    args = parser.parse_args()
    if (
        args.target_real_windows < 1
        or args.workers < 1
        or args.max_in_flight < 1
        or args.batch_size < 1
        or args.bootstrap_batch_size < 1
    ):
        parser.error("target, workers, queues, and batch sizes must be positive")
    if args.max_runtime_seconds is not None and args.max_runtime_seconds <= 0:
        parser.error("max-runtime-seconds must be positive")
    if not args.resume and (args.output_dir / "stream-state.json").exists():
        raise RuntimeError("Existing stream state requires --resume or a new output directory")
    trainer = TorchBatchTrainer(args.output_dir, args.device, args.seed)
    searcher = (
        PlanetaryComputerLandsatSearcher()
        if args.provider == "planetary-computer"
        else UsgsLandsatSearcher()
    )
    live_source = LandsatPairSource(searcher, RasterioCogBackend(), args.window_size)
    source = CachedPairSource(live_source, args.output_dir.parent / "raster-block-cache")
    try:
        summary = run_stream(
            args.manifest,
            args.output_dir,
            source,
            target=args.target_real_windows,
            seed=args.seed,
            workers=args.workers,
            queue_size=args.max_in_flight,
            batch_size=args.batch_size,
            bootstrap_batch_size=args.bootstrap_batch_size,
            max_attempts=args.max_attempts,
            first_batch_timeout_s=args.first_batch_timeout_seconds,
            no_progress_timeout_s=args.no_progress_timeout_seconds,
            max_runtime_s=args.max_runtime_seconds,
            train_batch=trainer,
        )
    except Exception as exc:
        summary = {
            "schema": "terra-training-004-real-streaming-v1",
            "status": "BLOCKED",
            "requested_target": args.target_real_windows,
            "distribution_provider": args.provider,
            "real_scientific_windows_trained": 0,
            "generated_satellite_pixels": False,
            "test001_leakage": False,
            "benchmark_leakage": False,
            "mission_leakage": False,
            "blocker": f"{type(exc).__name__}: {exc}",
        }
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "failure-summary.json").write_text(
            json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(json.dumps(summary, sort_keys=True), flush=True)
        return 2
    summary["distribution_provider"] = args.provider
    (args.output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, sort_keys=True))
    return 0 if summary["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
