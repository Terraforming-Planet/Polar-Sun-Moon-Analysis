from __future__ import annotations

import json
import time
from importlib import import_module
from pathlib import Path
from typing import Any

import numpy as np


def select_device(requested: str, torch: Any) -> str:
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is unavailable")
    if requested == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return requested


def _model(torch: Any, channels: int = 8) -> Any:
    nn = torch.nn
    return nn.Sequential(
        nn.Conv2d(channels, 32, 3, stride=2, padding=1),
        nn.GELU(),
        nn.Conv2d(32, 48, 3, stride=2, padding=1),
        nn.GELU(),
        nn.AdaptiveAvgPool2d(1),
        nn.Flatten(),
        nn.Linear(48, 7),
    )


def train_temporal_arrays(
    pairs: list[tuple[np.ndarray, np.ndarray]],
    output_dir: Path,
    *,
    device_request: str,
    batch_size: int,
    seed: int,
    resume: bool,
) -> dict[str, Any]:
    try:
        torch = import_module("torch")
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for Training #4") from exc
    if not pairs:
        raise ValueError("No quality-gated temporal raster pairs were provided")
    device_name = select_device(device_request, torch)
    device = torch.device(device_name)
    torch.manual_seed(seed)
    if device_name == "cuda":
        torch.cuda.manual_seed_all(seed)
        torch.cuda.reset_peak_memory_stats()
    model = _model(torch).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)
    checkpoint = output_dir / "checkpoints" / "latest.pt"
    start_step = 0
    if resume and checkpoint.exists():
        state = torch.load(checkpoint, map_location=device, weights_only=True)
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        start_step = int(state["step"])
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    losses: list[float] = []
    model.train()
    for offset in range(0, len(pairs), max(1, batch_size)):
        batch = pairs[offset : offset + max(1, batch_size)]
        arrays = [np.concatenate(pair, axis=0) for pair in batch]
        tensor = torch.from_numpy(np.stack(arrays)).to(device=device, dtype=torch.float32)
        valid = torch.nan_to_num(tensor, nan=0.0)
        # V0 temporal consistency: predict a deterministic seven-way pseudo-task only
        # to exercise shared representation learning. It is not environmental truth.
        target = torch.zeros(len(batch), dtype=torch.long, device=device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(valid)
        loss = torch.nn.functional.cross_entropy(logits, target)
        loss.backward()
        optimizer.step()
        losses.append(float(loss.detach().cpu()))
    step = start_step + len(losses)
    torch.save(
        {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "step": step,
            "seed": seed,
        },
        checkpoint,
    )
    elapsed = time.monotonic() - started
    metrics: dict[str, Any] = {
        "schema": "terra-training-004-water-cycle-training-v1",
        "phase": "V0_representation_smoke",
        "objective": "temporal_representation_with_missing_observation_awareness",
        "environmental_finding": False,
        "device": device_name,
        "cuda_available": bool(torch.cuda.is_available()),
        "gpu_name": torch.cuda.get_device_name(0) if device_name == "cuda" else None,
        "torch_version": str(torch.__version__),
        "cuda_version": str(torch.version.cuda) if torch.version.cuda else None,
        "steps": len(losses),
        "resumed_from_step": start_step,
        "losses": losses,
        "wall_clock_seconds": elapsed,
        "packs_per_second": len(pairs) / elapsed if elapsed else None,
        "gpu_peak_vram_mib": (
            torch.cuda.max_memory_allocated() / 1048576 if device_name == "cuda" else None
        ),
        "checkpoint": str(checkpoint),
    }
    (output_dir / "training_metrics.json").write_text(
        json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return metrics
