from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


def assess_training_labels(root: Path = Path("data/training")) -> dict[str, Any]:
    masks = (
        [
            p
            for p in root.rglob("*")
            if p.is_file()
            and p.suffix.lower() in {".tif", ".tiff", ".png"}
            and any(token in p.name.lower() for token in ("mask", "label"))
        ]
        if root.exists()
        else []
    )
    geography_groups = {p.parent.name for p in masks}
    sufficient = len(masks) >= 30 and len(geography_groups) >= 3
    hashes = {p.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in masks}
    return {
        "supervised_training": "eligible"
        if sufficient
        else "skipped_insufficient_legitimate_labels",
        "legitimate_mask_count": len(masks),
        "geography_group_count": len(geography_groups),
        "minimum_masks": 30,
        "minimum_geographies": 3,
        "label_hashes": hashes,
        "note": "The paleoriver feature CSV is not treated as a global segmentation label set.",
    }
