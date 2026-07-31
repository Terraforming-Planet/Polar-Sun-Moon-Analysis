#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any


def _read_meminfo() -> dict[str, int]:
    values: dict[str, int] = {}
    path = Path("/proc/meminfo")
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        key, _, raw = line.partition(":")
        token = raw.strip().split()[0] if raw.strip() else "0"
        if token.isdigit():
            values[key] = int(token) * 1024
    return values


def _run(command: list[str]) -> str | None:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    output = (result.stdout or result.stderr).strip()
    return output or None


def detect_accelerator() -> dict[str, Any]:
    if shutil.which("nvidia-smi"):
        output = _run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ]
        )
        if output:
            return {"available": True, "vendor": "nvidia", "details": output}

    dri = Path("/dev/dri")
    if dri.exists():
        render_nodes = sorted(path.name for path in dri.glob("renderD*"))
        if render_nodes:
            return {
                "available": True,
                "vendor": "drm",
                "details": render_nodes,
            }

    return {
        "available": False,
        "vendor": None,
        "details": "No CUDA, ROCm or DRM render device exposed to this container",
    }


def build_profile() -> dict[str, Any]:
    meminfo = _read_meminfo()
    logical_cpus = os.cpu_count() or 1
    available_memory = meminfo.get("MemAvailable", meminfo.get("MemTotal", 0))
    reserved_cpus = max(2, logical_cpus // 8)
    recommended_workers = max(1, min(24, logical_cpus - reserved_cpus))

    return {
        "platform": platform.platform(),
        "logical_cpus": logical_cpus,
        "memory_total_bytes": meminfo.get("MemTotal", 0),
        "memory_available_bytes": available_memory,
        "recommended_cpu_workers": recommended_workers,
        "recommended_io_workers": min(32, max(4, logical_cpus)),
        "recommended_memory_per_worker_bytes": (
            available_memory // recommended_workers if recommended_workers else 0
        ),
        "accelerator": detect_accelerator(),
    }


def main() -> int:
    print(json.dumps(build_profile(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
