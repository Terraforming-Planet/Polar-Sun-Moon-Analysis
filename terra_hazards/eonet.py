"""Public NASA EONET adapter for current natural-event geometries."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"


def fetch_open_events(limit: int = 200, timeout: int = 45) -> dict[str, object]:
    """Fetch and normalize open NASA EONET events without inventing severity."""
    response = requests.get(
        EONET_URL, params={"status": "open", "limit": str(limit)}, timeout=timeout
    )
    response.raise_for_status()
    payload: dict[str, Any] = response.json()
    features: list[dict[str, object]] = []
    for event in payload.get("events", []):
        geometries = event.get("geometry") or []
        if not geometries:
            continue
        latest = geometries[-1]
        geometry = latest.get("coordinates")
        geometry_type = latest.get("type")
        if not geometry or geometry_type not in {"Point", "Polygon"}:
            continue
        categories = [item.get("title", "Unknown") for item in event.get("categories", [])]
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": geometry_type, "coordinates": geometry},
                "properties": {
                    "id": event.get("id"),
                    "title": event.get("title"),
                    "categories": categories,
                    "observation_time": latest.get("date"),
                    "source_url": event.get("link"),
                    "evidence_class": "OBSERVATION_CATALOGUE",
                    "severity": None,
                    "confidence": None,
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "source": EONET_URL,
        "notice": "EONET is a curated event catalogue, not an official emergency alert service.",
        "features": features,
    }


def write_open_events(output: Path, limit: int = 200) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(fetch_open_events(limit), indent=2), encoding="utf-8")
    return output
