from __future__ import annotations

from environmental_monitor.orchestrator import parallel_pipeline


def test_auto_uses_threads_without_shared_memory(monkeypatch) -> None:
    monkeypatch.setattr(
        parallel_pipeline,
        "_process_backend_looks_available",
        lambda: False,
    )

    assert parallel_pipeline.choose_backend("auto") == "thread"


def test_auto_uses_processes_with_shared_memory(monkeypatch) -> None:
    monkeypatch.setattr(
        parallel_pipeline,
        "_process_backend_looks_available",
        lambda: True,
    )

    assert parallel_pipeline.choose_backend("auto") == "process"


def test_explicit_backend_is_preserved() -> None:
    assert parallel_pipeline.choose_backend("thread") == "thread"
    assert parallel_pipeline.choose_backend("process") == "process"
    assert parallel_pipeline.choose_backend("sequential") == "sequential"
