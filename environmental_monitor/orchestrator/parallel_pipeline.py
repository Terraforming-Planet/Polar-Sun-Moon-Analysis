#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from concurrent.futures import (
    Executor,
    ProcessPoolExecutor,
    ThreadPoolExecutor,
    as_completed,
)
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from environmental_monitor.orchestrator.resource_profile import build_profile

Backend = Literal["auto", "process", "thread", "sequential"]


@dataclass(frozen=True)
class Task:
    task_id: str
    command: list[str]
    output_path: str | None = None


@dataclass
class TaskResult:
    task_id: str
    return_code: int
    duration_seconds: float
    stdout: str
    stderr: str
    output_exists: bool | None


def _execute(task: Task) -> TaskResult:
    started = time.monotonic()
    env = os.environ.copy()
    env.setdefault("OMP_NUM_THREADS", "1")
    env.setdefault("OPENBLAS_NUM_THREADS", "1")
    env.setdefault("MKL_NUM_THREADS", "1")
    env.setdefault("NUMEXPR_NUM_THREADS", "1")
    result = subprocess.run(
        task.command,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    output_exists = None
    if task.output_path:
        output_exists = Path(task.output_path).exists()
    return TaskResult(
        task_id=task.task_id,
        return_code=result.returncode,
        duration_seconds=round(time.monotonic() - started, 3),
        stdout=result.stdout[-4000:],
        stderr=result.stderr[-4000:],
        output_exists=output_exists,
    )


def load_tasks(path: Path) -> list[Task]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_tasks = payload.get("tasks")
    if not isinstance(raw_tasks, list):
        raise ValueError("Manifest must contain a tasks list")
    tasks: list[Task] = []
    for index, item in enumerate(raw_tasks):
        if not isinstance(item, dict):
            raise ValueError(f"Task {index} must be an object")
        command = item.get("command")
        if not isinstance(command, list) or not all(isinstance(v, str) for v in command):
            raise ValueError(f"Task {index} command must be a list of strings")
        tasks.append(
            Task(
                task_id=str(item.get("id") or f"task-{index:04d}"),
                command=command,
                output_path=(str(item["output_path"]) if item.get("output_path") else None),
            )
        )
    return tasks


def _process_backend_looks_available() -> bool:
    """Return False for containers that do not expose POSIX shared memory.

    ``ProcessPoolExecutor`` relies on multiprocessing semaphores. Some CDSE
    Jupyter containers do not expose the required shared-memory/semaphore
    facilities, which raises ``FileNotFoundError`` before any task starts.
    """

    shm = Path("/dev/shm")
    return shm.is_dir() and os.access(shm, os.R_OK | os.W_OK | os.X_OK)


def choose_backend(requested: Backend) -> Literal["process", "thread", "sequential"]:
    if requested != "auto":
        return requested
    return "process" if _process_backend_looks_available() else "thread"


def _run_with_executor(
    tasks: list[Task],
    executor: Executor,
) -> list[TaskResult]:
    results: list[TaskResult] = []
    futures = {executor.submit(_execute, task): task.task_id for task in tasks}
    for future in as_completed(futures):
        result = future.result()
        results.append(result)
        print(
            f"[{result.return_code}] {result.task_id} "
            f"({result.duration_seconds:.3f}s)",
            flush=True,
        )
    return sorted(results, key=lambda item: item.task_id)


def run(
    tasks: list[Task],
    workers: int,
    backend: Backend = "auto",
) -> tuple[list[TaskResult], str]:
    selected = choose_backend(backend)

    if selected == "sequential" or workers == 1:
        results = [_execute(task) for task in tasks]
        for result in results:
            print(
                f"[{result.return_code}] {result.task_id} "
                f"({result.duration_seconds:.3f}s)",
                flush=True,
            )
        return sorted(results, key=lambda item: item.task_id), "sequential"

    if selected == "thread":
        with ThreadPoolExecutor(max_workers=workers) as executor:
            return _run_with_executor(tasks, executor), "thread"

    try:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            return _run_with_executor(tasks, executor), "process"
    except (FileNotFoundError, OSError) as exc:
        if backend == "process":
            raise
        print(
            "Process backend unavailable; falling back to ThreadPoolExecutor: "
            f"{exc}",
            flush=True,
        )
        with ThreadPoolExecutor(max_workers=workers) as executor:
            return _run_with_executor(tasks, executor), "thread-fallback"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run independent image/tile jobs across available CDSE CPU cores."
    )
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--workers", type=int)
    parser.add_argument(
        "--backend",
        choices=("auto", "process", "thread", "sequential"),
        default="auto",
        help=(
            "Execution backend. Auto uses processes when POSIX shared memory is "
            "available and otherwise uses threads."
        ),
    )
    parser.add_argument("--report", type=Path, default=Path("parallel-pipeline-report.json"))
    args = parser.parse_args()

    profile = build_profile()
    tasks = load_tasks(args.manifest)
    workers = args.workers or int(profile["recommended_cpu_workers"])
    workers = max(1, min(workers, len(tasks) or 1))

    started = time.monotonic()
    results, backend_used = run(tasks, workers, args.backend)
    report: dict[str, Any] = {
        "resource_profile": profile,
        "backend_requested": args.backend,
        "backend_used": backend_used,
        "workers": workers,
        "task_count": len(tasks),
        "failed_count": sum(result.return_code != 0 for result in results),
        "duration_seconds": round(time.monotonic() - started, 3),
        "results": [asdict(result) for result in results],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 1 if report["failed_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
