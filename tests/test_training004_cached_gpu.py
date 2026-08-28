from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from scripts.run_training004_cached_gpu_l4 import load_cached_pairs


def write_pair(root: Path, name: str, *, generated: bool = False) -> None:
    before = np.zeros((4, 8, 8), dtype=np.float32)
    before[0], before[2], before[3] = 0.2, 0.3, 0.3
    after = before.copy()
    after[0], after[2], after[3] = 0.5, 0.1, 0.1
    np.savez_compressed(root / f"{name}.npz", before=before, after=after)
    (root / f"{name}.json").write_text(
        json.dumps(
            {
                "pack_id": name,
                "region_id": "amazon-basin",
                "generated_satellite_pixels": generated,
                "test001_leakage": False,
            }
        ),
        encoding="utf-8",
    )


def test_cached_pairs_require_real_provenance_and_preserve_unique_count(tmp_path: Path) -> None:
    write_pair(tmp_path, "pair-a")
    write_pair(tmp_path, "pair-b")
    arrays, targets, provenance = load_cached_pairs(tmp_path, max_pairs=10)
    assert arrays.shape == (2, 8, 8, 8)
    assert targets.tolist() == [2, 2]
    assert len(provenance) == 2
    assert all(row["derived_target"]["environmental_ground_truth"] is False for row in provenance)


def test_cached_pairs_reject_generated_satellite_pixels(tmp_path: Path) -> None:
    write_pair(tmp_path, "real")
    write_pair(tmp_path, "generated", generated=True)
    with pytest.raises(ValueError, match="not real-observation safe"):
        load_cached_pairs(tmp_path, max_pairs=10)
