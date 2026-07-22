"""Machine-readable catalogue of official observation sources."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CATALOG_PATH = Path(__file__).with_name("data_sources.json")


def load_catalog() -> list[dict[str, Any]]:
    """Load the curated source registry used by the app and CLI."""
    data: object = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Source catalogue must contain a JSON list")
    return [item for item in data if isinstance(item, dict)]
