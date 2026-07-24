from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests
import yaml

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def load_config(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Configuration must be a YAML mapping")
    required = {"stac_url", "collections", "regions", "start_date", "end_date"}
    missing = sorted(required.difference(data))
    if missing:
        raise ValueError(f"Missing configuration keys: {', '.join(missing)}")
    return data


def validate_bbox(bbox: list[float]) -> None:
    if len(bbox) != 4:
        raise ValueError("Bounding box must contain west, south, east and north")
    west, south, east, north = map(float, bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError(f"Invalid bounding box: {bbox}")


def request_json(
    method: str,
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    attempts: int = 5,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = requests.request(
                method,
                url,
                json=payload,
                timeout=(20, 90),
            )
            if response.status_code in RETRYABLE_STATUS and attempt < attempts:
                time.sleep(10 * attempt)
                continue
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, dict):
                raise RuntimeError(f"Unexpected JSON response from {url}")
            return body
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(10 * attempt)
                continue
            break
    raise RuntimeError(f"Request failed after {attempts} attempts: {url}") from last_error


def available_collections(stac_url: str) -> set[str]:
    body = request_json("GET", f"{stac_url.rstrip('/')}/collections")
    collections = body.get("collections", [])
    if not isinstance(collections, list):
        raise RuntimeError("STAC collections response is malformed")
    return {
        str(item["id"])
        for item in collections
        if isinstance(item, dict) and item.get("id")
    }


def search_count(
    stac_url: str,
    collection: str,
    bbox: list[float],
    start_date: str,
    end_date: str,
    limit: int,
    cloud_cover_max: float,
) -> dict[str, Any]:
    validate_bbox(bbox)
    payload: dict[str, Any] = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": f"{start_date}T00:00:00Z/{end_date}T23:59:59Z",
        "limit": limit,
    }
    body = request_json("POST", f"{stac_url.rstrip('/')}/search", payload=payload)
    features = body.get("features", [])
    if not isinstance(features, list):
        raise RuntimeError("STAC search response is malformed")

    accepted = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties", {})
        cloud = properties.get("eo:cloud_cover") if isinstance(properties, dict) else None
        if cloud is None or float(cloud) <= cloud_cover_max:
            accepted.append(feature)

    dates = sorted(
        {
            str(feature.get("properties", {}).get("datetime", ""))[:10]
            for feature in accepted
            if isinstance(feature.get("properties"), dict)
            and feature.get("properties", {}).get("datetime")
        }
    )
    return {
        "returned_scene_count": len(accepted),
        "observation_dates": dates,
        "truncated": len(features) >= limit,
    }


def run(config_path: Path) -> dict[str, Any]:
    config = load_config(config_path)
    stac_url = str(config["stac_url"])
    configured = [str(value) for value in config["collections"]]
    available = available_collections(stac_url)
    enabled = [value for value in configured if value in available]
    unavailable = [value for value in configured if value not in available]

    results: dict[str, Any] = {}
    for region_id, region in config["regions"].items():
        bbox = [float(value) for value in region["bbox"]]
        region_result: dict[str, Any] = {
            "name": region.get("name", region_id),
            "bbox": bbox,
            "hazards": region.get("hazards", []),
            "collections": {},
        }
        for collection in enabled:
            region_result["collections"][collection] = search_count(
                stac_url,
                collection,
                bbox,
                str(config["start_date"]),
                str(config["end_date"]),
                int(config.get("limit_per_query", 20)),
                float(config.get("cloud_cover_max", 100)),
            )
        results[str(region_id)] = region_result

    output = {
        "run_at_utc": datetime.now(UTC).isoformat(),
        "source": "Copernicus Data Space Ecosystem STAC API",
        "scope": "catalogue availability foundation",
        "start_date": config["start_date"],
        "end_date": config["end_date"],
        "enabled_collections": enabled,
        "unavailable_configured_collections": unavailable,
        "regions": results,
        "limitations": [
            "This stage measures scene availability, not confirmed hazards.",
            "Hazard detection requires later pixel-level processing and validation.",
            "A regional tiled workflow is used instead of one oversized global query.",
        ],
    }
    output_path = Path(
        config.get(
            "output_path",
            "docs/data/copernicus/global_catalog_summary.json",
        )
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Monitor CDSE catalogue availability across configured regions"
    )
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.config), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
