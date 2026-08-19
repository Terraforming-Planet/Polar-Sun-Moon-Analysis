from __future__ import annotations

from pathlib import Path

import numpy as np

from terra_research_node.analysis.rivers import compare_water_masks
from terra_research_node.training import assess_training_labels


def test_water_mask_comparison_flags_fragmentation_without_causal_claim() -> None:
    before = np.zeros((8, 8), dtype=bool)
    before[2:6, 1:7] = True
    after = before.copy()
    after[:, 4] = False

    result = compare_water_masks(before, after)

    assert result["after_water_pixels"] < result["before_water_pixels"]
    assert result["connectivity_fragmentation_delta"] >= 1
    assert result["causal_claim"] is False


def test_context_json_is_not_counted_as_pixel_ground_truth(tmp_path: Path) -> None:
    training = tmp_path / "training"
    training.mkdir()
    (training / "sar_reference_labels_v1.json").write_text("{}", encoding="utf-8")

    result = assess_training_labels(training)

    assert result["legitimate_mask_count"] == 0
    assert result["supervised_training"] == "skipped_insufficient_legitimate_labels"
