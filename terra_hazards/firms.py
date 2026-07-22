"""NASA FIRMS active-fire API adapter."""

from __future__ import annotations

import csv
import io
import os
from typing import Any

import requests

FIRMS_AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def fetch_active_fires(
    area: str = "world",
    days: int = 1,
    source: str = "VIIRS_SNPP_NRT",
    map_key: str | None = None,
    timeout: int = 60,
) -> list[dict[str, Any]]:
    """Fetch true FIRMS detections; require the official per-user MAP_KEY."""
    key = map_key or os.getenv("NASA_FIRMS_MAP_KEY")
    if not key:
        raise RuntimeError("NASA_FIRMS_MAP_KEY is required for the FIRMS area API")
    url = f"{FIRMS_AREA_URL}/{key}/{source}/{area}/{days}"
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(response.text)))
    for row in rows:
        row["source_url"] = FIRMS_AREA_URL
        row["evidence_class"] = "OBSERVATION"
    return rows
