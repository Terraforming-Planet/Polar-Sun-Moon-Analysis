from __future__ import annotations

from collections import deque
from typing import Any

import numpy as np


def _component_count(mask: np.ndarray) -> int:
    water = np.asarray(mask, dtype=bool)
    visited = np.zeros_like(water, dtype=bool)
    rows, cols = water.shape
    count = 0
    for row in range(rows):
        for col in range(cols):
            if not water[row, col] or visited[row, col]:
                continue
            count += 1
            queue: deque[tuple[int, int]] = deque([(row, col)])
            visited[row, col] = True
            while queue:
                y, x = queue.popleft()
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    in_bounds = 0 <= ny < rows and 0 <= nx < cols
                    if in_bounds and water[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))
    return count


def compare_water_masks(before: np.ndarray, after: np.ndarray) -> dict[str, Any]:
    """Compare two binary water masks without claiming a physical cause."""
    before_mask = np.asarray(before, dtype=bool)
    after_mask = np.asarray(after, dtype=bool)
    if before_mask.ndim != 2 or after_mask.ndim != 2:
        raise ValueError("Water masks must be 2D arrays.")
    if before_mask.shape != after_mask.shape:
        raise ValueError("Before/after masks must have identical geometry.")

    before_area = int(before_mask.sum())
    after_area = int(after_mask.sum())
    delta = after_area - before_area
    loss_pct = 0.0 if before_area == 0 else (before_area - after_area) / before_area * 100
    exposed = int(np.logical_and(before_mask, ~after_mask).sum())
    gained = int(np.logical_and(~before_mask, after_mask).sum())

    before_width = before_mask.sum(axis=1)
    after_width = after_mask.sum(axis=1)
    constriction_rows = np.where(
        (before_width >= 4) & (after_width <= np.maximum(1, before_width * 0.5))
    )[0]

    before_components = _component_count(before_mask)
    after_components = _component_count(after_mask)
    connectivity_delta = after_components - before_components

    return {
        "evidence_class": "DERIVED_VALUE",
        "before_water_pixels": before_area,
        "after_water_pixels": after_area,
        "water_pixel_delta": delta,
        "water_loss_percent": float(loss_pct),
        "exposed_bed_pixels": exposed,
        "new_water_pixels": gained,
        "before_connected_components": before_components,
        "after_connected_components": after_components,
        "connectivity_fragmentation_delta": connectivity_delta,
        "possible_constriction_rows": constriction_rows.astype(int).tolist(),
        "possible_constriction": bool(len(constriction_rows)),
        "causal_claim": False,
        "interpretation_rule": (
            "A constriction is a morphology candidate only. Confirming a blocked inlet/outlet "
            "requires independent hydrological evidence."
        ),
    }
