from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


def _nvidia_smi() -> dict[str, str]:
    command = [
        "nvidia-smi",
        "--query-gpu=name,driver_version,memory.total,power.limit",
        "--format=csv,noheader,nounits",
    ]
    try:
        line = subprocess.check_output(command, text=True, timeout=10).splitlines()[0]
    except (FileNotFoundError, subprocess.SubprocessError, IndexError):
        return {}
    fields = [part.strip() for part in line.split(",")]
    if len(fields) < 4:
        return {}
    return {
        "name": fields[0],
        "driver_version": fields[1],
        "memory_total_mib": fields[2],
        "power_limit_w": fields[3],
    }


def detect_device() -> dict[str, Any]:
    """Return the actual Torch/CUDA device selected for local research."""
    result: dict[str, Any] = {
        "backend": "cpu",
        "name": "CPU",
        "cuda_available": False,
        "mixed_precision": False,
    }
    try:
        import torch
    except ImportError:
        result["torch_available"] = False
        result["nvidia_smi"] = _nvidia_smi()
        return result

    result["torch_available"] = True
    result["torch_version"] = torch.__version__
    result["cuda_available"] = bool(torch.cuda.is_available())
    result["cuda_version"] = torch.version.cuda
    result["nvidia_smi"] = _nvidia_smi()
    if torch.cuda.is_available():
        index = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(index)
        result.update(
            {
                "backend": "cuda",
                "name": torch.cuda.get_device_name(index),
                "device_index": index,
                "vram_bytes": int(props.total_memory),
                "mixed_precision": True,
            }
        )
    return result


def write_device_json(path: Path) -> dict[str, Any]:
    info = detect_device()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info
