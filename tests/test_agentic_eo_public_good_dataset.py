from __future__ import annotations

import json
from pathlib import Path

from scripts.build_agentic_eo_public_good_dataset import build_dataset, write_dataset

ROOT = Path(__file__).resolve().parents[1]


def test_public_good_dataset_builds_with_disjoint_splits(tmp_path: Path) -> None:
    registry = ROOT / "terra_hazards" / "data_sources.json"
    seed = ROOT / "datasets" / "agentic-eo-public-good-v1" / "seed.jsonl"

    rows = build_dataset(registry, seed)
    manifest = write_dataset(rows, tmp_path, registry, seed)

    assert len(rows) >= 100
    assert manifest["total_examples"] == len(rows)
    assert {row["split"] for row in rows} == {"train", "validation", "holdout"}

    ids_by_split = {
        split: {row["id"] for row in rows if row["split"] == split}
        for split in ("train", "validation", "holdout")
    }
    assert ids_by_split["train"].isdisjoint(ids_by_split["validation"])
    assert ids_by_split["train"].isdisjoint(ids_by_split["holdout"])
    assert ids_by_split["validation"].isdisjoint(ids_by_split["holdout"])

    groups: dict[str, set[str]] = {}
    for row in rows:
        groups.setdefault(row["group_key"], set()).add(row["split"])
    assert all(len(splits) == 1 for splits in groups.values())


def test_frozen_benchmark_cases_are_not_training_rows() -> None:
    registry = ROOT / "terra_hazards" / "data_sources.json"
    seed = ROOT / "datasets" / "agentic-eo-public-good-v1" / "seed.jsonl"
    rows = build_dataset(registry, seed)

    benchmark = json.loads((ROOT / "config" / "agentic-eo-benchmark-v1.json").read_text(encoding="utf-8"))
    benchmark_questions = {str(case["question"]).strip() for case in benchmark["cases"]}
    dataset_questions = {
        str(row["messages"][1]["content"]).strip()
        for row in rows
    }

    assert benchmark_questions.isdisjoint(dataset_questions)
    assert not any(str(row["id"]).startswith("B0") for row in rows)


def test_dataset_contains_public_good_safety_behaviours() -> None:
    registry = ROOT / "terra_hazards" / "data_sources.json"
    seed = ROOT / "datasets" / "agentic-eo-public-good-v1" / "seed.jsonl"
    rows = build_dataset(registry, seed)

    tasks = {row["task"] for row in rows}
    assert "source_selection" in tasks
    assert "tool_recovery" in tasks
    assert "deterministic_calculation" in tasks
    assert "claim_boundary" in tasks

    blob = "\n".join(
        str(message["content"])
        for row in rows
        for message in row["messages"]
    ).casefold()
    assert "do not invent" in blob or "do not fabricate" in blob
    assert "unknown" in blob
    assert "sentinel-1" in blob
    assert "landsat" in blob
    assert "grace" in blob


def test_generated_manifest_hashes_are_present(tmp_path: Path) -> None:
    registry = ROOT / "terra_hazards" / "data_sources.json"
    seed = ROOT / "datasets" / "agentic-eo-public-good-v1" / "seed.jsonl"
    rows = build_dataset(registry, seed)
    manifest = write_dataset(rows, tmp_path, registry, seed)

    for split in ("train", "validation", "holdout"):
        entry = manifest["splits"][split]
        assert entry["examples"] > 0
        assert len(entry["sha256"]) == 64
        assert (tmp_path / f"{split}.jsonl").is_file()

    assert len(manifest["source_registry"]["sha256"]) == 64
    assert len(manifest["curated_seed"]["sha256"]) == 64
