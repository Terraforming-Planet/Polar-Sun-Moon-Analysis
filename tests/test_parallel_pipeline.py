from __future__ import annotations

import json
from pathlib import Path

from environmental_monitor.orchestrator.parallel_pipeline import Task, load_tasks, run
from environmental_monitor.orchestrator.resource_profile import build_profile


def test_resource_profile_has_safe_worker_limits() -> None:
    profile = build_profile()
    workers = profile["recommended_cpu_workers"]
    assert isinstance(workers, int)
    assert 1 <= workers <= 24
    assert profile["logical_cpus"] >= 1
    assert "accelerator" in profile


def test_load_tasks_and_run_parallel(tmp_path: Path) -> None:
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "tasks": [
                    {
                        "id": "one",
                        "command": ["python", "-c", "print('one')"],
                    },
                    {
                        "id": "two",
                        "command": ["python", "-c", "print('two')"],
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    tasks = load_tasks(manifest)
    assert tasks == [
        Task(task_id="one", command=["python", "-c", "print('one')"]),
        Task(task_id="two", command=["python", "-c", "print('two')"]),
    ]

    results, backend_used = run(tasks, workers=2, backend="thread")
    assert backend_used == "thread"
    assert [result.task_id for result in results] == ["one", "two"]
    assert all(result.return_code == 0 for result in results)
